import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Application } from "@prisma/client";
import {
  ForbiddenApiException,
  ConflictApiException,
  BadRequestApiException,
} from "@/common/exceptions/api.exception";
import { ErrorCode } from "@/common/exceptions/error-codes";
import { EmailService } from "@/common/services/email.service";
import { isOwnedUploadUrl } from "@/modules/uploads/upload-url.util";
import { buildPagination, paginationSkip } from "@/common/utils/paginate";
import type { Pagination } from "@/common/interfaces/pagination.interface";
import type { EnvConfig } from "@/core/config/env.validation";
import { ApplicationsRepository } from "./applications.repository";
import type { ApplyDto } from "./dto/apply.dto";
import type { ApplicationWithJob } from "./interfaces";
import {
  buildApplicationStatusCounts,
  type ApplicationStatusCounts,
} from "./applications.util";

@Injectable()
export class ApplicationsService {
  private readonly logger = new Logger(ApplicationsService.name);

  constructor(
    private readonly applicationsRepository: ApplicationsRepository,
    private readonly emailService: EmailService,
    private readonly config: ConfigService<EnvConfig, true>,
  ) {}

  async findAllForUser(
    userId: string,
    page: number,
    limit: number,
  ): Promise<{ applications: ApplicationWithJob[]; pagination: Pagination }> {
    const talent =
      await this.applicationsRepository.findTalentIdByUserId(userId);
    if (!talent) {
      return { applications: [], pagination: buildPagination(page, limit, 0) };
    }

    const skip = paginationSkip(page, limit);
    const [applications, total] =
      await this.applicationsRepository.findByTalentId(talent.id, skip, limit);
    return { applications, pagination: buildPagination(page, limit, total) };
  }

  /** DB-side status breakdown for TalentDashboard's stat tiles — see applications.util.ts. */
  async getStatusCounts(userId: string): Promise<ApplicationStatusCounts> {
    const talent =
      await this.applicationsRepository.findTalentIdByUserId(userId);
    if (!talent) return buildApplicationStatusCounts([]);

    const rows = await this.applicationsRepository.getStatusCountsByTalentId(
      talent.id,
    );
    return buildApplicationStatusCounts(rows);
  }

  async apply(userId: string, dto: ApplyDto): Promise<Application> {
    const talent =
      await this.applicationsRepository.findTalentWithUserName(userId);
    if (!talent) {
      throw new ForbiddenApiException(
        "Talent profile required",
        ErrorCode.TALENT_PROFILE_REQUIRED,
      );
    }

    const existing = await this.applicationsRepository.findByJobAndTalent(
      dto.jobId,
      talent.id,
    );
    if (existing) {
      throw new ConflictApiException(
        "Already applied",
        ErrorCode.ALREADY_APPLIED,
      );
    }

    // resumeUrl was only checked with z.string().url() — any URL passed the DTO,
    // completely bypassing the presign flow's content-type allowlist, size cap,
    // and rate limit. Only accept a URL this user could actually have obtained
    // from their own POST /uploads/presign call.
    if (
      dto.resumeUrl &&
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

    const { application, job } =
      await this.applicationsRepository.createAndIncrementApplyCount({
        jobId: dto.jobId,
        talentId: talent.id,
        coverLetter: dto.coverLetter,
        resumeUrl: dto.resumeUrl,
      });

    // The application is already committed above — a notification-email failure
    // must not turn a successful apply into a 500 (a retry would then wrongly
    // hit "Already applied").
    try {
      await this.emailService.sendApplicationReceivedEmail(
        job.employer.user.email,
        job.title,
        talent.user.name ?? "A candidate",
      );
    } catch (error) {
      this.logger.error(
        `Failed to send application-received email for application ${application.id}`,
        error instanceof Error ? error.stack : error,
      );
    }

    return application;
  }
}
