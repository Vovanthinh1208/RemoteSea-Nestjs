import { Inject, Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { CACHE_MANAGER, type Cache } from "@nestjs/cache-manager";
import { Prisma } from "@prisma/client";
import * as crypto from "crypto";
import {
  EmployerRepository,
  type ProfileWithJobCount,
  type PublicEmployerProfile,
} from "./employer.repository";
import { ALLOWED_TRANSITIONS, VERIFICATION_TOKEN_TTL_MS } from "./constants";
import type { CreateEmployerProfileDto } from "./dto/create-employer-profile.dto";
import type { UpdateEmployerProfileDto } from "./dto/update-employer-profile.dto";
import type { ListEmployerJobsDto } from "./dto/list-employer-jobs.dto";
import type { ListJobApplicationsDto } from "./dto/list-job-applications.dto";
import type { UpdateApplicationDto } from "./dto/update-application.dto";
import type { SubmitVerificationDto } from "./dto/submit-verification.dto";
import type { ConfirmVerificationDto } from "./dto/confirm-verification.dto";
import { domainMatches } from "./verification.util";
import { slugify, withUniqueSuffix } from "@/common/utils/slugify";
import { buildPagination, paginationSkip } from "@/common/utils/paginate";
import { assertFound } from "@/common/utils/assert-found";
import { isOwnedUploadUrl } from "@/modules/uploads/upload-url.util";
import { UploadsService } from "@/modules/uploads/uploads.service";
import type { EnvConfig } from "@/core/config/env.validation";
import { EmailService } from "@/common/services/email.service";
import { runInBackground } from "@/common/utils/background-task.util";
import { getOrSetCache } from "@/common/caching/cache.util";
import {
  BadRequestApiException,
  ConflictApiException,
  ForbiddenApiException,
} from "@/common/exceptions/api.exception";
import { ErrorCode } from "@/common/exceptions/error-codes";
import type { ApplicationWithJobOwner } from "./guards/application-ownership.guard";

// Below this many responded applications, a public "responds within ~Xh"
// figure is more noise than signal (and trivially gameable by an employer
// with 1-2 fast responses) — the stat simply doesn't render rather than
// showing a misleadingly precise number.
const MIN_RESPONDED_APPLICATIONS_FOR_PUBLIC_STAT = 3;
const PUBLIC_RESPONSE_STATS_CACHE_TTL_MS = 300_000;

@Injectable()
export class EmployerService {
  private readonly logger = new Logger(EmployerService.name);

  constructor(
    private readonly employerRepository: EmployerRepository,
    private readonly config: ConfigService<EnvConfig, true>,
    private readonly uploadsService: UploadsService,
    private readonly emailService: EmailService,
    @Inject(CACHE_MANAGER) private readonly cache: Cache,
  ) {}

  async createProfile(
    userId: string,
    dto: CreateEmployerProfileDto,
  ): Promise<{ id: string; slug: string; companyName: string }> {
    const existing = await this.employerRepository.findProfileByUserId(userId);
    if (existing) {
      throw new ConflictApiException(
        "Employer profile already exists",
        ErrorCode.EMPLOYER_PROFILE_ALREADY_EXISTS,
      );
    }

    // A company name made entirely of characters slugify can't transliterate
    // (e.g. CJK, or Vietnamese with no plain-Latin fallback) reduces to an empty
    // base — previously the *first* such employer got that empty string written
    // straight to the DB as their slug, breaking their public profile URL.
    const base = slugify(dto.companyName);
    const taken = base
      ? await this.employerRepository.findProfileBySlug(base)
      : true;
    const slug = taken ? withUniqueSuffix(base || "company") : base;

    try {
      return await this.employerRepository.createProfileForUser(
        userId,
        dto,
        slug,
      );
    } catch (error) {
      // Two concurrent signups for the same company name can both pass the
      // findProfileBySlug check above before either writes — retry once with a
      // guaranteed-unique slug instead of surfacing a raw conflict to the loser.
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        return this.employerRepository.createProfileForUser(
          userId,
          dto,
          withUniqueSuffix(base || "company"),
        );
      }
      throw error;
    }
  }

  async getProfile(
    userId: string,
  ): Promise<ProfileWithJobCount & { totalApplications: number }> {
    const [profile, totalApplications] = await Promise.all([
      this.employerRepository.findProfileWithJobCount(userId),
      this.employerRepository.countApplicationsForOwner(userId),
    ]);
    assertFound(
      profile,
      "Profile not found",
      ErrorCode.EMPLOYER_PROFILE_NOT_FOUND,
    );

    return { ...profile, totalApplications };
  }

  async updateProfile(
    userId: string,
    dto: UpdateEmployerProfileDto,
  ): Promise<PublicEmployerProfile> {
    const profile = await this.employerRepository.findProfileByUserId(userId);
    assertFound(
      profile,
      "Profile not found",
      ErrorCode.EMPLOYER_PROFILE_NOT_FOUND,
    );

    // logoUrl was only checked with z.string().url() — any URL passed the DTO,
    // completely bypassing the presign flow's content-type allowlist, size cap,
    // and rate limit. Only accept a URL this user could actually have obtained
    // from their own POST /uploads/presign call.
    if (
      dto.logoUrl &&
      !isOwnedUploadUrl(
        dto.logoUrl,
        this.config.get("CDN_URL", { infer: true }),
        userId,
        "logo",
      )
    ) {
      throw new BadRequestApiException(
        "logoUrl must be an uploaded file from this account",
        ErrorCode.UPLOAD_URL_NOT_OWNED,
      );
    }

    const updated = await this.employerRepository.updateProfile(
      profile.id,
      dto,
    );

    // Best-effort — a previous logo being replaced would otherwise sit orphaned
    // in the bucket forever, since nothing else in the app ever cleans it up.
    // Bare void (not runInBackground) is safe only because deleteObjectByUrl
    // catches and logs its own failures internally, so this promise never
    // rejects — if that internal handling is ever removed, this becomes an
    // unhandled rejection and should switch to runInBackground.
    if (dto.logoUrl && profile.logoUrl && profile.logoUrl !== dto.logoUrl) {
      void this.uploadsService.deleteObjectByUrl(profile.logoUrl);
    }

    return updated;
  }

  // Admin-triggered (AdminService.verifyEmployer/suspendEmployer), not
  // self-service — but the write itself belongs here, not reimplemented in
  // AdminRepository, since this module owns the EmployerProfile domain.
  setVerified(id: string, isVerified: boolean) {
    return this.employerRepository.setVerified(id, isVerified);
  }

  suspend(id: string): Promise<void> {
    return this.employerRepository.suspend(id);
  }

  // Called by JobsService when rendering a public job detail page (see
  // jobs.module.ts's import of EmployerModule) — cached per-employer since
  // it's a live two-table aggregate and the job-detail route itself has no
  // HTTP cache layer (it increments viewCount per request). Returns null
  // below the sample-size floor, same "just don't show it" handling a job
  // with no salary gets rather than a misleading number.
  async getPublicResponseHours(employerId: string): Promise<number | null> {
    const { avgHours, respondedCount } = await getOrSetCache(
      this.cache,
      `employer:${employerId}:public-response-stats`,
      PUBLIC_RESPONSE_STATS_CACHE_TTL_MS,
      () => this.employerRepository.getPublicResponseStats(employerId),
    );
    if (respondedCount < MIN_RESPONDED_APPLICATIONS_FOR_PUBLIC_STAT) {
      return null;
    }
    return avgHours;
  }

  async submitVerification(
    userId: string,
    dto: SubmitVerificationDto,
  ): Promise<void> {
    const profile =
      await this.employerRepository.findProfileForVerification(userId);
    assertFound(
      profile,
      "Profile not found",
      ErrorCode.EMPLOYER_PROFILE_NOT_FOUND,
    );

    if (!profile.websiteUrl) {
      throw new BadRequestApiException(
        "Add a company website before verifying",
        ErrorCode.EMPLOYER_WEBSITE_REQUIRED,
      );
    }

    if (!domainMatches(profile.websiteUrl, dto.email)) {
      throw new BadRequestApiException(
        "Email domain must match your company website",
        ErrorCode.EMPLOYER_VERIFICATION_DOMAIN_MISMATCH,
      );
    }

    const token = crypto.randomBytes(32).toString("hex");
    await this.employerRepository.createEmailVerification(
      profile.id,
      dto.email,
      token,
      new Date(Date.now() + VERIFICATION_TOKEN_TTL_MS),
    );

    runInBackground(
      this.emailService.sendEmployerVerificationEmail(
        dto.email,
        profile.companyName,
        token,
      ),
      this.logger,
      `Failed to send verification email for employer ${profile.id}`,
    );
  }

  async confirmVerification(dto: ConfirmVerificationDto): Promise<void> {
    const record = await this.employerRepository.findEmailVerificationByToken(
      dto.token,
    );
    if (!record || record.consumedAt) {
      throw new BadRequestApiException(
        "Invalid or expired token",
        ErrorCode.INVALID_OR_EXPIRED_TOKEN,
      );
    }

    if (record.expiresAt < new Date()) {
      await this.employerRepository.markVerificationFailed(record.employerId);
      throw new BadRequestApiException(
        "Invalid or expired token",
        ErrorCode.INVALID_OR_EXPIRED_TOKEN,
      );
    }

    const confirmed = await this.employerRepository.consumeEmailVerification(
      record.id,
      record.employerId,
    );
    if (!confirmed) {
      throw new BadRequestApiException(
        "Invalid or expired token",
        ErrorCode.INVALID_OR_EXPIRED_TOKEN,
      );
    }
  }

  async listJobs(userId: string, dto: ListEmployerJobsDto) {
    const employer = await this.employerRepository.findProfileByUserId(userId);
    if (!employer) {
      throw new ForbiddenApiException(
        "Employer profile required",
        ErrorCode.EMPLOYER_PROFILE_REQUIRED,
      );
    }

    const [
      jobs,
      { totalApps, shortlisted, avgTimeToHireInDays, avgFirstResponseHours },
    ] = await Promise.all([
      this.employerRepository.findJobsByEmployer(employer.id, dto.status),
      this.employerRepository.getEmployerJobStats(employer.id),
    ]);

    return {
      jobs,
      stats: {
        totalApps,
        shortlisted,
        avgTimeToHireInDays,
        avgFirstResponseHours,
      },
    };
  }

  async listJobApplications(jobId: string, dto: ListJobApplicationsDto) {
    // Ownership is already enforced by EmployerJobOwnershipGuard before this runs.
    const { status, page, limit } = dto;
    const skip = paginationSkip(page, limit);
    const { applications, total } =
      await this.employerRepository.findApplicationsForJob(
        jobId,
        status,
        skip,
        limit,
      );

    return {
      applications,
      pagination: buildPagination(page, limit, total),
    };
  }

  async updateApplication(
    application: ApplicationWithJobOwner,
    dto: UpdateApplicationDto,
  ) {
    // Ownership is already enforced by ApplicationOwnershipGuard before this runs.
    const { status, notes } = dto;
    if (
      status !== application.status &&
      !ALLOWED_TRANSITIONS[application.status].includes(status)
    ) {
      throw new BadRequestApiException(
        `Cannot transition from ${application.status} to ${status}`,
        ErrorCode.INVALID_STATUS_TRANSITION,
      );
    }

    const updated = await this.employerRepository.updateApplication(
      application.id,
      application.status,
      status,
      notes,
    );
    if (!updated) {
      throw new ConflictApiException(
        "Application was updated concurrently — please refresh and try again",
        ErrorCode.APPLICATION_UPDATE_CONFLICT,
      );
    }
    return updated;
  }
}
