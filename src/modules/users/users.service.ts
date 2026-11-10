import { Injectable, Logger, HttpStatus } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { ConfigService } from "@nestjs/config";
// Native bcrypt (threadpool) — see auth.service.ts for the bcryptjs rationale.
import * as bcrypt from "bcrypt";
import type { NotificationPreference, User } from "@prisma/client";
import { UsersRepository, type AccountFields } from "./users.repository";
import type { UpdateUserDto } from "./dto/update-user.dto";
import type { DeleteAccountDto } from "./dto/delete-account.dto";
import type { ChangePasswordDto } from "./dto/change-password.dto";
import type { UpdateAccountDto } from "./dto/update-account.dto";
import type { UpdateNotificationPreferencesDto } from "./dto/update-notification-preferences.dto";
import {
  BadRequestApiException,
  ConflictApiException,
  ApiException,
  TooManyRequestsApiException,
  ServiceUnavailableApiException,
} from "@/common/exceptions/api.exception";
import { ErrorCode } from "@/common/exceptions/error-codes";
import { BCRYPT_SALT_ROUNDS } from "@/common/constants/bcrypt.constants";
import { UploadsService } from "@/modules/uploads/uploads.service";
import { isOwnedUploadUrl } from "@/modules/uploads/upload-url.util";
import type { EnvConfig } from "@/core/config/env.validation";
import { AuthService } from "@/modules/auth/auth.service";
import { MetricsService } from "@/modules/metrics/metrics.service";
import { sanitizePersonalData } from "./personal-data-sanitizer";
import { renderPersonalDataPdf } from "./personal-data-pdf-job";
import {
  personalDataAccountSchema,
  EXPORT_SCHEMA_VERSION,
  EXPORT_BYTE_LIMIT,
  ExportTooLargeError,
  type PersonalDataExportPayload,
  type ExportLocale,
} from "./personal-data-contract";

@Injectable()
export class UsersService {
  private readonly exportLogger = new Logger("PersonalDataExport");
  private readonly exportsInProgress = new Set<string>();
  private static activeExports = 0;
  constructor(
    private readonly usersRepository: UsersRepository,
    private readonly uploadsService: UploadsService,
    private readonly config: ConfigService<EnvConfig, true>,
    private readonly authService: AuthService,
    private readonly metricsService: MetricsService,
  ) {}

  updateName(
    userId: string,
    dto: UpdateUserDto,
  ): Promise<Pick<User, "id" | "name" | "email">> {
    return this.usersRepository.updateName(userId, dto.name);
  }

  async deleteAccount(userId: string, dto: DeleteAccountDto): Promise<void> {
    const credentials = await this.usersRepository.findPasswordHash(userId);
    if (credentials?.passwordHash) {
      const valid =
        !!dto.password &&
        (await bcrypt.compare(dto.password, credentials.passwordHash));
      if (!valid) {
        this.metricsService.recordAuthFailure(
          "delete_account_invalid_password",
        );
        throw new BadRequestApiException(
          "Current password is incorrect",
          ErrorCode.CURRENT_PASSWORD_INCORRECT,
        );
      }
    }

    // jobs.employerId is ON DELETE RESTRICT specifically to make this
    // unconditionally safe — but check first and give a clear, actionable
    // error rather than letting the delete fail with a raw FK-violation.
    // Only ever non-zero for an EMPLOYER-role user (a TALENT has no
    // EmployerProfile, so this is always 0 for them).
    const jobCount = await this.usersRepository.countEmployerJobs(userId);
    if (jobCount > 0) {
      throw new ConflictApiException(
        `Cannot delete account with ${jobCount} active job posting(s) — close or transfer them first`,
        ErrorCode.ACTIVE_JOBS_PREVENT_DELETION,
      );
    }

    // Same Restrict-style guard as jobCount above, for the same reason:
    // CompanyMember/TeamInvitation cascade from EmployerProfile, which
    // cascades from User — without this check, deleting the account that
    // created a company with zero job postings but active teammates or
    // pending invites would silently delete every one of those other users'
    // seats and invites along with it.
    const { members, pendingInvitations } =
      await this.usersRepository.countTeamObligations(userId);
    if (members > 0 || pendingInvitations > 0) {
      const parts: string[] = [];
      if (members > 0) parts.push(`${members} active team member(s)`);
      if (pendingInvitations > 0) {
        parts.push(`${pendingInvitations} pending invitation(s)`);
      }
      throw new ConflictApiException(
        `Cannot delete account with ${parts.join(" and ")} — remove them first`,
        ErrorCode.ACTIVE_TEAM_PREVENTS_DELETION,
      );
    }

    // Read before the cascade-delete below removes the only DB record of
    // these keys (see findProfileFileUrls); cleanup itself runs after the
    // delete commits, best-effort — bare void is safe here because
    // deleteObjectByUrl catches and logs its own failures internally, same
    // as the profile-update call sites in employer.service.ts/talent.service.ts.
    const { resumeUrl, logoUrl } =
      await this.usersRepository.findProfileFileUrls(userId);

    await this.usersRepository.deleteUser(userId);

    if (resumeUrl) void this.uploadsService.deleteObjectByUrl(resumeUrl);
    if (logoUrl) void this.uploadsService.deleteObjectByUrl(logoUrl);
  }

  async changePassword(
    userId: string,
    dto: ChangePasswordDto,
    currentSessionId: string,
  ): Promise<{ message: string }> {
    const user = await this.usersRepository.findPasswordHash(userId);
    if (!user?.passwordHash) {
      throw new BadRequestApiException(
        "Password change is not available for social sign-in accounts.",
        ErrorCode.SOCIAL_ACCOUNT_NO_PASSWORD,
      );
    }

    const valid = await bcrypt.compare(dto.currentPassword, user.passwordHash);
    if (!valid) {
      // Same alertable signal as AuthService.disableTwoFactor's own —
      // never the password itself, just that an attempt against this
      // account failed.
      this.metricsService.recordAuthFailure("change_password_invalid_password");
      throw new BadRequestApiException(
        "Current password is incorrect",
        ErrorCode.CURRENT_PASSWORD_INCORRECT,
      );
    }

    if (dto.newPassword === dto.currentPassword) {
      throw new BadRequestApiException(
        "New password must be different from the current one",
        ErrorCode.NEW_PASSWORD_SAME_AS_CURRENT,
      );
    }

    const passwordHash = await bcrypt.hash(dto.newPassword, BCRYPT_SALT_ROUNDS);
    await this.usersRepository.updatePasswordHash(userId, passwordHash);
    // PB12: every other device is signed out (the old password may be exactly
    // what someone riding an existing session already knows); the session that
    // just proved the current password stays signed in.
    await this.authService.revokeOtherSessions(userId, currentSessionId);

    return { message: "Password updated" };
  }

  async getAccount(userId: string): Promise<AccountFields> {
    const account = await this.usersRepository.findAccount(userId);
    if (!account) {
      throw new BadRequestApiException(
        "Account not found",
        ErrorCode.USER_NOT_FOUND,
      );
    }
    return account;
  }

  async updateAccount(
    userId: string,
    dto: UpdateAccountDto,
  ): Promise<AccountFields> {
    const previous =
      dto.image !== undefined
        ? await this.usersRepository.findAccount(userId)
        : null;

    // dto.image was only checked with z.string().url() — any URL would pass
    // the DTO, bypassing the presign flow's content-type allowlist, size cap,
    // and rate limit entirely. Only accept a URL this user could actually have
    // obtained from their own POST /uploads/presign call. Skipped when it's
    // unchanged from what's already stored (same reasoning as
    // TalentService.upsertProfile's resumeUrl check) and when it's `null`
    // (removing the photo) — there's nothing to own in either case.
    if (
      dto.image &&
      dto.image !== previous?.image &&
      !isOwnedUploadUrl(
        dto.image,
        this.config.get("CDN_URL", { infer: true }),
        userId,
        "avatar",
      )
    ) {
      throw new BadRequestApiException(
        "image must be an uploaded file from this account",
        ErrorCode.UPLOAD_URL_NOT_OWNED,
      );
    }

    const updated = await this.usersRepository.updateAccount(userId, dto);

    // Best-effort — same "nothing else ever cleans this up" gap that
    // TalentService.upsertProfile's resumeUrl replacement closes. Bare void is
    // safe only because deleteObjectByUrl catches and logs its own failures.
    if (previous?.image && previous.image !== dto.image) {
      void this.uploadsService.deleteObjectByUrl(previous.image);
    }

    return updated;
  }

  getNotificationPreferences(userId: string): Promise<NotificationPreference> {
    return this.usersRepository.getNotificationPreferences(userId);
  }

  updateNotificationPreferences(
    userId: string,
    dto: UpdateNotificationPreferencesDto,
  ): Promise<NotificationPreference> {
    return this.usersRepository.updateNotificationPreferences(userId, dto);
  }

  async getPauseState(userId: string): Promise<Pick<User, "isPaused">> {
    const state = await this.usersRepository.findPauseState(userId);
    if (!state) {
      throw new BadRequestApiException(
        "Account not found",
        ErrorCode.USER_NOT_FOUND,
      );
    }
    return state;
  }

  async pauseAccount(userId: string) {
    // Update the pause state and revoke sessions together so a database error
    // cannot leave a paused account with valid pre-pause tokens.
    return this.usersRepository.setPausedAndRevokeSessions(userId);
  }

  reactivateAccount(userId: string) {
    return this.usersRepository.setPaused(userId, false);
  }

  private async collectExport(
    userId: string,
  ): Promise<PersonalDataExportPayload> {
    const data = await this.usersRepository.findExportData(userId);
    // The route is behind JwtAuthGuard against the token's own sub claim, so
    // a missing row here would mean the user row vanished mid-request (e.g. a
    // concurrent account deletion) rather than an ownership problem.
    if (!data) {
      throw new BadRequestApiException(
        "Account not found",
        ErrorCode.USER_NOT_FOUND,
      );
    }
    const { exportSnapshotAt, ...fields } = data;
    const serialized = JSON.stringify(sanitizePersonalData(fields));
    if (Buffer.byteLength(serialized) > EXPORT_BYTE_LIMIT)
      throw new ExportTooLargeError();
    const account = personalDataAccountSchema.parse(JSON.parse(serialized));
    if (account.id !== userId) throw new Error("Invalid export ownership");
    return {
      exportedAt: (exportSnapshotAt ?? new Date()).toISOString(),
      account,
      metadata: {
        referenceId: randomUUID(),
        schemaVersion: EXPORT_SCHEMA_VERSION,
        timeZone: "UTC",
        consistency: "read-only REPEATABLE READ snapshot",
        messageScope:
          "authored messages in currently authorized application conversations",
        exclusions: [
          "Credentials and sessions",
          "Other users' data and incoming messages",
          "Employer-private notes, scorecards and AI evaluations",
          "External attachment bytes",
          "Saved jobs, reviews, interview files and AI conversation history",
        ],
      },
    };
  }

  private async withExportGuard<T>(
    userId: string,
    format: "pdf" | "json",
    action: () => Promise<{ value: T; referenceId: string; bytes: number }>,
  ): Promise<T> {
    if (this.exportsInProgress.has(userId) || UsersService.activeExports >= 2)
      throw new TooManyRequestsApiException(5);
    this.exportsInProgress.add(userId);
    UsersService.activeExports++;
    const started = Date.now();
    try {
      const result = await action();
      this.exportLogger.log(
        JSON.stringify({
          event: "personal_data_export",
          format,
          outcome: "completed",
          referenceId: result.referenceId,
          bytes: result.bytes,
          durationMs: Date.now() - started,
        }),
      );
      return result.value;
    } catch (error) {
      // Audit metadata only. Never log query errors, account IDs, names,
      // email addresses, message bodies, tokens or document contents.
      this.exportLogger.warn(
        JSON.stringify({
          event: "personal_data_export",
          format,
          outcome: "failed",
          durationMs: Date.now() - started,
        }),
      );
      if (error instanceof ApiException) throw error;
      if (error instanceof ExportTooLargeError)
        throw new ApiException(
          HttpStatus.PAYLOAD_TOO_LARGE,
          "This export exceeds the current archive limits. Try JSON for a large PDF, or contact support for a larger archive.",
          ErrorCode.BAD_REQUEST,
        );
      throw new ServiceUnavailableApiException(
        "Your data export could not be prepared. Please try again shortly.",
      );
    } finally {
      this.exportsInProgress.delete(userId);
      UsersService.activeExports--;
    }
  }

  exportData(userId: string): Promise<PersonalDataExportPayload> {
    return this.withExportGuard(userId, "json", async () => {
      const payload = await this.collectExport(userId);
      return {
        value: payload,
        referenceId: payload.metadata!.referenceId,
        bytes: Buffer.byteLength(JSON.stringify(payload)),
      };
    });
  }

  exportDataAsPdf(
    userId: string,
    locale: ExportLocale = "vi",
  ): Promise<Buffer> {
    return this.withExportGuard(userId, "pdf", async () => {
      const payload = await this.collectExport(userId);
      const value = await renderPersonalDataPdf(payload, locale);
      return {
        value,
        referenceId: payload.metadata!.referenceId,
        bytes: value.length,
      };
    });
  }

  listConnections(userId: string) {
    return this.usersRepository.listConnections(userId);
  }

  async disconnectConnection(userId: string, provider: string): Promise<void> {
    const result = await this.usersRepository.disconnectConnectionSafely(
      userId,
      provider,
    );

    switch (result) {
      case "user_not_found":
        throw new BadRequestApiException(
          "Account not found",
          ErrorCode.USER_NOT_FOUND,
        );
      case "last_sign_in_method":
        throw new ConflictApiException(
          "Set a password or keep at least one other connected account before disconnecting this one.",
          ErrorCode.LAST_SIGN_IN_METHOD,
        );
      case "connection_not_found":
        throw new BadRequestApiException(
          "That provider isn't connected to this account",
          ErrorCode.CONNECTION_NOT_FOUND,
        );
      case "disconnected":
        return;
    }
  }
}
