import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Application } from "@prisma/client";
import {
  ForbiddenApiException,
  ConflictApiException,
  BadRequestApiException,
} from "@/common/exceptions/api.exception";
import { EmailService } from "@/common/services/email.service";
import { isOwnedUploadUrl } from "@/modules/uploads/upload-url.util";
import type { EnvConfig } from "@/core/config/env.validation";
import { ApplicationsRepository } from "./applications.repository";
import type { ApplyDto } from "./dto/apply.dto";
import type { ApplicationWithJob } from "./interfaces";

@Injectable()
export class ApplicationsService {
  private readonly logger = new Logger(ApplicationsService.name);

  constructor(
    private readonly applicationsRepository: ApplicationsRepository,
    private readonly emailService: EmailService,
    private readonly config: ConfigService<EnvConfig, true>,
  ) {}

  async findAllForUser(userId: string): Promise<ApplicationWithJob[]> {
    const talent =
      await this.applicationsRepository.findTalentIdByUserId(userId);
    if (!talent) return [];
    return this.applicationsRepository.findByTalentId(talent.id);
  }

  async apply(userId: string, dto: ApplyDto): Promise<Application> {
    const talent =
      await this.applicationsRepository.findTalentWithUserName(userId);
    if (!talent) {
      throw new ForbiddenApiException("Talent profile required");
    }

    const existing = await this.applicationsRepository.findByJobAndTalent(
      dto.jobId,
      talent.id,
    );
    if (existing) {
      throw new ConflictApiException("Already applied");
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
