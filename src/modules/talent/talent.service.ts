import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import * as crypto from "crypto";
import { TalentRepository } from "./talent.repository";
import { TalentMapper } from "./talent.mapper";
import type { TalentProfileDto } from "./dto/update-talent-profile.dto";
import type { ListTalentSearchDto } from "./dto/list-talent-search.dto";
import type { SubmitVerificationDto } from "./dto/submit-verification.dto";
import type { ConfirmVerificationDto } from "./dto/confirm-verification.dto";
import { buildTalentSearchWhere } from "./talent-search.util";
import { VERIFICATION_TOKEN_TTL_MS } from "./constants";
import type { OwnTalentProfile, TalentProfileWithSkills } from "./interfaces";
import type { ActivityItem } from "./activity.interfaces";
import {
  ACTIVITY_FEED_LIMIT,
  interviewsToActivity,
  invitationsToActivity,
  mergeActivity,
  messagesToActivity,
  statusEventsToActivity,
} from "./activity.util";
import type { TalentSearchItem } from "@/common/types/talent-search-item.type";
import type { Pagination } from "@/common/interfaces/pagination.interface";
import { buildPagination, paginationSkip } from "@/common/utils/paginate";
import { uniqueSlug } from "@/common/utils/slugify";
import { assertFound } from "@/common/utils/assert-found";
import { isOwnedUploadUrl } from "@/modules/uploads/upload-url.util";
import { UploadsService } from "@/modules/uploads/uploads.service";
import type { EnvConfig } from "@/core/config/env.validation";
import { EmailService } from "@/common/services/email.service";
import { runInBackground } from "@/common/utils/background-task.util";
import {
  BadRequestApiException,
  NotFoundApiException,
} from "@/common/exceptions/api.exception";
import { ErrorCode } from "@/common/exceptions/error-codes";
import { SalaryRange } from "@/modules/jobs/salary-range";
import type { AuthenticatedUser } from "@/common/interfaces/authenticated-user.interface";
import { ProfileViewsService } from "@/modules/profile-views/profile-views.service";
import type { ProfileViewAnalytics } from "@/modules/profile-views/interfaces";

@Injectable()
export class TalentService {
  private readonly logger = new Logger(TalentService.name);

  constructor(
    private readonly talentRepository: TalentRepository,
    private readonly config: ConfigService<EnvConfig, true>,
    private readonly uploadsService: UploadsService,
    private readonly emailService: EmailService,
    private readonly profileViewsService: ProfileViewsService,
  ) {}

  async getOwnProfile(userId: string): Promise<OwnTalentProfile> {
    const profile = await this.talentRepository.findByUserId(userId);
    assertFound(
      profile,
      "Profile not found",
      ErrorCode.TALENT_PROFILE_NOT_FOUND,
    );
    return profile;
  }

  // No talent profile yet -> no activity, same "empty, not an error" shape
  // as ApplicationsService.findAllForUser (a brand-new user hitting their
  // own dashboard isn't a 404).
  async getActivity(userId: string): Promise<ActivityItem[]> {
    const talent = await this.talentRepository.findTalentIdByUserId(userId);
    if (!talent) return [];

    const [statusEvents, messages, interviews, invitations] = await Promise.all(
      [
        this.talentRepository.findRecentStatusEvents(
          talent.id,
          ACTIVITY_FEED_LIMIT,
        ),
        this.talentRepository.findRecentMessagesReceived(
          talent.id,
          userId,
          ACTIVITY_FEED_LIMIT,
        ),
        this.talentRepository.findRecentInterviews(
          talent.id,
          ACTIVITY_FEED_LIMIT,
        ),
        this.talentRepository.findRecentInvitations(
          talent.id,
          ACTIVITY_FEED_LIMIT,
        ),
      ],
    );

    return mergeActivity(
      statusEventsToActivity(statusEvents),
      messagesToActivity(messages),
      interviewsToActivity(interviews),
      invitationsToActivity(invitations),
    );
  }

  async getPublicProfile(
    slug: string,
    viewer: AuthenticatedUser | null,
  ): Promise<Record<string, unknown>> {
    const profile = await this.talentRepository.findBySlug(slug);
    assertFound(
      profile,
      "Profile not found",
      ErrorCode.TALENT_PROFILE_NOT_FOUND,
    );

    if (profile.visibility === "VERIFIED_EMPLOYERS") {
      const allowed =
        viewer?.role === "EMPLOYER" &&
        (await this.talentRepository.isVerifiedEmployer(viewer.id));
      // Same response as a nonexistent slug — doesn't reveal that a profile
      // exists but is gated, just that this caller can't see it here.
      if (!allowed) {
        throw new NotFoundApiException(
          "Profile not found",
          ErrorCode.TALENT_PROFILE_NOT_FOUND,
        );
      }
    }

    // Best-effort — a profile view failing to record must never break the
    // profile page itself. Guarded internally (recordView no-ops for an
    // anonymous or non-Employer viewer), so this fires on every call and
    // lets the service decide who actually counts.
    runInBackground(
      this.profileViewsService.recordView(viewer, profile.id),
      this.logger,
      `Failed to record profile view for talent ${profile.id}`,
    );

    return TalentMapper.toPublicProfile(profile);
  }

  // "me/profile-views" twin of getActivity: returns a zero-value result
  // (not 404) for a caller with no talent profile yet, same reasoning —
  // simpler for the dashboard to render than a special-cased error state.
  async getProfileViewAnalytics(userId: string): Promise<ProfileViewAnalytics> {
    const talent = await this.talentRepository.findTalentIdByUserId(userId);
    if (!talent) return { totalViews: 0, uniqueViewers: 0 };
    return this.profileViewsService.getAnalytics(talent.id);
  }

  async search(
    viewer: AuthenticatedUser,
    query: ListTalentSearchDto,
  ): Promise<{ talents: TalentSearchItem[]; pagination: Pagination }> {
    const includeGated = await this.talentRepository.isVerifiedEmployer(
      viewer.id,
    );
    const where = buildTalentSearchWhere(query, includeGated);
    const { page, limit } = query;
    const skip = paginationSkip(page, limit);

    const [talents, total] = await Promise.all([
      this.talentRepository.search(where, skip, limit),
      this.talentRepository.count(where),
    ]);

    return { talents, pagination: buildPagination(page, limit, total) };
  }

  async upsertProfile(
    userId: string,
    dto: TalentProfileDto,
  ): Promise<TalentProfileWithSkills> {
    const { skills, ...profileData } = dto;

    // Two independent reads (different tables, no data dependency between them —
    // `slug` only needs `user.name`, the checks below only need `existing`), so
    // they run concurrently instead of one after the other.
    const [user, existing] = await Promise.all([
      this.talentRepository.findUserName(userId),
      // Only the 3 scalars below are read from `existing` — narrow query, not the
      // full skills+user join findByUserId does for the "get my profile" read endpoint.
      this.talentRepository.findSalaryAndResumeByUserId(userId),
    ]);
    assertFound(user, "User not found", ErrorCode.USER_NOT_FOUND);
    const slug = uniqueSlug(user.name ?? "talent");

    // upsertProfileWithSkills only touches fields present in this request (Prisma
    // `update: data`), so a caller that sends just one of the two salary fields
    // must be checked against the *effective* post-update pair, not just this
    // request's fields in isolation. Same rule as JobsService.update's
    // SalaryRange.merge(job, dto) — reuse it instead of re-deriving it here.
    SalaryRange.merge(
      {
        salaryMin: existing?.desiredSalaryMin ?? null,
        salaryMax: existing?.desiredSalaryMax ?? null,
      },
      { salaryMin: dto.desiredSalaryMin, salaryMax: dto.desiredSalaryMax },
    );

    // resumeUrl was only checked with z.string().url() — any URL passed the DTO,
    // completely bypassing the presign flow's content-type allowlist, size cap,
    // and rate limit. Only accept a URL this user could actually have obtained
    // from their own POST /uploads/presign call. Skipped when it's unchanged
    // from what's already stored — that value cleared this same check when it
    // was first set, and every other field on this form (headline, bio, ...)
    // resubmits its current value on every save, so re-validating an untouched
    // resumeUrl here would turn "edit your bio" into "re-prove you own your
    // resume" on every single save.
    if (
      dto.resumeUrl &&
      dto.resumeUrl !== existing?.resumeUrl &&
      !isOwnedUploadUrl(
        dto.resumeUrl,
        this.config.get("CDN_URL", { infer: true }),
        userId,
        "resume",
      )
    ) {
      throw new BadRequestApiException(
        "resumeUrl must be an uploaded file from this account",
        ErrorCode.UPLOAD_URL_NOT_OWNED,
      );
    }

    const profile = await this.talentRepository.upsertProfileWithSkills(
      userId,
      slug,
      profileData,
      skills,
    );

    // Best-effort — a previous resume being replaced would otherwise sit
    // orphaned in the bucket forever, since nothing else in the app ever cleans
    // it up. Bare void (not runInBackground) is safe only because
    // deleteObjectByUrl catches and logs its own failures internally, so this
    // promise never rejects — if that internal handling is ever removed, this
    // becomes an unhandled rejection and should switch to runInBackground.
    if (
      dto.resumeUrl &&
      existing?.resumeUrl &&
      existing.resumeUrl !== dto.resumeUrl
    ) {
      void this.uploadsService.deleteObjectByUrl(existing.resumeUrl);
    }

    const updated = await this.talentRepository.findByIdWithSkills(profile.id);
    assertFound(
      updated,
      "Profile not found",
      ErrorCode.TALENT_PROFILE_NOT_FOUND,
    );
    return updated;
  }

  // Mirrors EmployerService.submitVerification exactly, minus the
  // domain-match precondition — a person has no company website to check
  // the address against, so submitting is just proving control of it.
  async submitVerification(
    userId: string,
    dto: SubmitVerificationDto,
  ): Promise<void> {
    const profile =
      await this.talentRepository.findProfileForVerification(userId);
    assertFound(
      profile,
      "Profile not found",
      ErrorCode.TALENT_PROFILE_NOT_FOUND,
    );

    const token = crypto.randomBytes(32).toString("hex");
    await this.talentRepository.createEmailVerification(
      profile.id,
      dto.email,
      token,
      new Date(Date.now() + VERIFICATION_TOKEN_TTL_MS),
    );

    runInBackground(
      this.emailService.sendTalentVerificationEmail(dto.email, token),
      this.logger,
      `Failed to send verification email for talent ${profile.id}`,
    );
  }

  async confirmVerification(dto: ConfirmVerificationDto): Promise<void> {
    const record = await this.talentRepository.findEmailVerificationByToken(
      dto.token,
    );
    if (!record || record.consumedAt) {
      throw new BadRequestApiException(
        "Invalid or expired token",
        ErrorCode.INVALID_OR_EXPIRED_TOKEN,
      );
    }

    if (record.expiresAt < new Date()) {
      await this.talentRepository.markVerificationFailed(record.talentId);
      throw new BadRequestApiException(
        "Invalid or expired token",
        ErrorCode.INVALID_OR_EXPIRED_TOKEN,
      );
    }

    const confirmed = await this.talentRepository.consumeEmailVerification(
      record.id,
      record.talentId,
    );
    if (!confirmed) {
      throw new BadRequestApiException(
        "Invalid or expired token",
        ErrorCode.INVALID_OR_EXPIRED_TOKEN,
      );
    }
  }
}
