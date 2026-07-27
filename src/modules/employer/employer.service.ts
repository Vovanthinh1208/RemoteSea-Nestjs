import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Prisma } from "@prisma/client";
import {
  EmployerRepository,
  type ProfileWithJobCount,
  type PublicEmployerProfile,
} from "./employer.repository";
import { ALLOWED_TRANSITIONS } from "./constants";
import type { CreateEmployerProfileDto } from "./dto/create-employer-profile.dto";
import type { UpdateEmployerProfileDto } from "./dto/update-employer-profile.dto";
import type { ListEmployerJobsDto } from "./dto/list-employer-jobs.dto";
import type { ListJobApplicationsDto } from "./dto/list-job-applications.dto";
import type { UpdateApplicationDto } from "./dto/update-application.dto";
import { slugify, withUniqueSuffix } from "@/common/utils/slugify";
import { buildPagination, paginationSkip } from "@/common/utils/paginate";
import { assertFound } from "@/common/utils/assert-found";
import { isOwnedUploadUrl } from "@/modules/uploads/upload-url.util";
import { UploadsService } from "@/modules/uploads/uploads.service";
import type { EnvConfig } from "@/core/config/env.validation";
import {
  BadRequestApiException,
  ConflictApiException,
  ForbiddenApiException,
} from "@/common/exceptions/api.exception";
import { ErrorCode } from "@/common/exceptions/error-codes";
import type { ApplicationWithJobOwner } from "./guards/application-ownership.guard";

@Injectable()
export class EmployerService {
  constructor(
    private readonly employerRepository: EmployerRepository,
    private readonly config: ConfigService<EnvConfig, true>,
    private readonly uploadsService: UploadsService,
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

  async listJobs(userId: string, dto: ListEmployerJobsDto) {
    const employer = await this.employerRepository.findProfileByUserId(userId);
    if (!employer) {
      throw new ForbiddenApiException(
        "Employer profile required",
        ErrorCode.EMPLOYER_PROFILE_REQUIRED,
      );
    }

    const [jobs, { totalApps, shortlisted, avgTimeToHireInDays }] =
      await Promise.all([
        this.employerRepository.findJobsByEmployer(employer.id, dto.status),
        this.employerRepository.getEmployerJobStats(employer.id),
      ]);

    return {
      jobs,
      stats: {
        totalApps,
        shortlisted,
        avgTimeToHireInDays,
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
