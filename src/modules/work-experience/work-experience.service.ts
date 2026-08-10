import { Injectable } from "@nestjs/common";
import type { WorkExperience } from "@prisma/client";
import { WorkExperienceRepository } from "./work-experience.repository";
import { MAX_WORK_EXPERIENCES_PER_PROFILE } from "./constants";
import type { CreateWorkExperienceDto } from "./dto/create-work-experience.dto";
import type { UpdateWorkExperienceDto } from "./dto/update-work-experience.dto";
import {
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
  update(id: string, dto: UpdateWorkExperienceDto): Promise<WorkExperience> {
    return this.workExperienceRepository.update(id, dto);
  }

  async remove(id: string): Promise<{ success: true }> {
    await this.workExperienceRepository.delete(id);
    return { success: true };
  }
}
