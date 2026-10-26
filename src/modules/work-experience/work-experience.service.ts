import { Injectable } from "@nestjs/common";
import type { WorkExperience } from "@prisma/client";
import { WorkExperienceRepository } from "./work-experience.repository";
import { MAX_WORK_EXPERIENCES_PER_PROFILE } from "./constants";
import type { CreateWorkExperienceDto } from "./dto/create-work-experience.dto";
import type { UpdateWorkExperienceDto } from "./dto/update-work-experience.dto";
import type { WorkExperienceWithOwner } from "./guards/work-experience-ownership.guard";
import {
  BadRequestApiException,
  ConflictApiException,
  ForbiddenApiException,
} from "@/common/exceptions/api.exception";
import { ErrorCode } from "@/common/exceptions/error-codes";

@Injectable()
export class WorkExperienceService {
  constructor(
    private readonly workExperienceRepository: WorkExperienceRepository,
  ) {}

  // No profile yet means no experience entries either — same "return []
  // rather than error" precedent as ApplicationsService.listJobIdsForUser.
  async listForUser(userId: string): Promise<WorkExperience[]> {
    const talent =
      await this.workExperienceRepository.findTalentIdByUserId(userId);
    if (!talent) return [];
    return this.workExperienceRepository.findByTalentId(talent.id);
  }

  async create(
    userId: string,
    dto: CreateWorkExperienceDto,
  ): Promise<WorkExperience> {
    const talent =
      await this.workExperienceRepository.findTalentIdByUserId(userId);
    if (!talent) {
      throw new ForbiddenApiException(
        "Talent profile required",
        ErrorCode.TALENT_PROFILE_REQUIRED,
      );
    }

    const count = await this.workExperienceRepository.countByTalentId(
      talent.id,
    );
    if (count >= MAX_WORK_EXPERIENCES_PER_PROFILE) {
      throw new ConflictApiException(
        `You can list up to ${MAX_WORK_EXPERIENCES_PER_PROFILE} roles — remove one before adding another.`,
        ErrorCode.WORK_EXPERIENCE_LIMIT_REACHED,
      );
    }

    return this.workExperienceRepository.create(talent.id, dto);
  }

  // Ownership is already enforced by WorkExperienceOwnershipGuard before
  // these run — same division of responsibility as AlertsService.
  async update(
    experience: WorkExperienceWithOwner,
    dto: UpdateWorkExperienceDto,
  ): Promise<WorkExperience> {
    // The DTO can only compare the two dates when both are in the request;
    // a PATCH may send just one, so PB24 RC2 (start strictly before end) is
    // checked against the effective post-update pair here.
    const startDate = dto.startDate ?? experience.startDate;
    const endDate =
      dto.endDate === undefined ? experience.endDate : dto.endDate;
    if (endDate && endDate <= startDate) {
      throw new BadRequestApiException(
        "endDate must be after startDate",
        ErrorCode.VALIDATION_ERROR,
      );
    }
    return this.workExperienceRepository.update(experience.id, dto);
  }

  async remove(id: string): Promise<{ success: true }> {
    await this.workExperienceRepository.delete(id);
    return { success: true };
  }
}
