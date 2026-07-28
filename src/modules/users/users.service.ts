import { Injectable } from "@nestjs/common";
// Native bcrypt (threadpool) — see auth.service.ts for the bcryptjs rationale.
import * as bcrypt from "bcrypt";
import type { NotificationPreference, User } from "@prisma/client";
import { UsersRepository, type AccountFields } from "./users.repository";
import type { UpdateUserDto } from "./dto/update-user.dto";
import type { ChangePasswordDto } from "./dto/change-password.dto";
import type { UpdateAccountDto } from "./dto/update-account.dto";
import type { UpdateNotificationPreferencesDto } from "./dto/update-notification-preferences.dto";
import {
  BadRequestApiException,
  ConflictApiException,
} from "@/common/exceptions/api.exception";
import { ErrorCode } from "@/common/exceptions/error-codes";
import { BCRYPT_SALT_ROUNDS } from "@/common/constants/bcrypt.constants";
import { UploadsService } from "@/modules/uploads/uploads.service";

@Injectable()
export class UsersService {
  constructor(
    private readonly usersRepository: UsersRepository,
    private readonly uploadsService: UploadsService,
  ) {}

  updateName(
    userId: string,
    dto: UpdateUserDto,
  ): Promise<Pick<User, "id" | "name" | "email">> {
    return this.usersRepository.updateName(userId, dto.name);
  }

  async deleteAccount(userId: string): Promise<void> {
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
      throw new BadRequestApiException(
        "Current password is incorrect",
        ErrorCode.CURRENT_PASSWORD_INCORRECT,
      );
    }

    const passwordHash = await bcrypt.hash(dto.newPassword, BCRYPT_SALT_ROUNDS);
    await this.usersRepository.updatePasswordHash(userId, passwordHash);

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

  updateAccount(userId: string, dto: UpdateAccountDto): Promise<AccountFields> {
    return this.usersRepository.updateAccount(userId, dto);
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

  pauseAccount(userId: string) {
    return this.usersRepository.setPaused(userId, true);
  }

  reactivateAccount(userId: string) {
    return this.usersRepository.setPaused(userId, false);
  }

  async exportData(userId: string) {
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
    return { exportedAt: new Date().toISOString(), account: data };
  }

  listConnections(userId: string) {
    return this.usersRepository.listConnections(userId);
  }

  async disconnectConnection(userId: string, provider: string): Promise<void> {
    const state =
      await this.usersRepository.findPasswordHashAndConnectionCount(userId);
    if (!state) {
      throw new BadRequestApiException(
        "Account not found",
        ErrorCode.USER_NOT_FOUND,
      );
    }
    // Disconnecting the only sign-in method would lock the user out entirely —
    // block it unless a password is set (the fallback sign-in method) or more
    // than one provider remains linked.
    if (!state.passwordHash && state.connectionCount <= 1) {
      throw new ConflictApiException(
        "Set a password or keep at least one other connected account before disconnecting this one.",
        ErrorCode.LAST_SIGN_IN_METHOD,
      );
    }
    const deleted = await this.usersRepository.deleteConnection(
      userId,
      provider,
    );
    if (!deleted) {
      throw new BadRequestApiException(
        "That provider isn't connected to this account",
        ErrorCode.CONNECTION_NOT_FOUND,
      );
    }
  }
}
