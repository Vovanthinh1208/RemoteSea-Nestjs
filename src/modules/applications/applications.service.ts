import { Injectable } from "@nestjs/common";
import type { Application } from "@prisma/client";
import { ForbiddenApiException, ConflictApiException } from "@/common/exceptions/api.exception";
import { EmailService } from "@/common/services/email.service";
import { ApplicationsRepository } from "./applications.repository";
import type { ApplyDto } from "./dto/apply.dto";
import type { ApplicationWithJob } from "./interfaces";

@Injectable()
export class ApplicationsService {
  constructor(
    private readonly applicationsRepository: ApplicationsRepository,
    private readonly emailService: EmailService
  ) {}

  async findAllForUser(userId: string): Promise<ApplicationWithJob[]> {
    const talent = await this.applicationsRepository.findTalentIdByUserId(userId);
    if (!talent) return [];
    return this.applicationsRepository.findByTalentId(talent.id);
  }

  async apply(userId: string, dto: ApplyDto): Promise<Application> {
    const talent = await this.applicationsRepository.findTalentWithUserName(userId);
    if (!talent) {
      throw new ForbiddenApiException("Talent profile required");
    }

    const existing = await this.applicationsRepository.findByJobAndTalent(dto.jobId, talent.id);
    if (existing) {
      throw new ConflictApiException("Already applied");
    }

    const { application, job } = await this.applicationsRepository.createAndIncrementApplyCount({
      jobId: dto.jobId,
      talentId: talent.id,
      coverLetter: dto.coverLetter,
      resumeUrl: dto.resumeUrl,
    });

    await this.emailService.sendApplicationReceivedEmail(
      job.employer.user.email,
      job.title,
      talent.user.name ?? "A candidate"
    );

    return application;
  }
}
