import { Injectable } from "@nestjs/common";
import type { ProfileHighlight } from "@prisma/client";
import { ProfileHighlightsRepository } from "./profile-highlights.repository";
import { MAX_HIGHLIGHTS_PER_TYPE } from "./constants";
import type { CreateProfileHighlightDto } from "./dto/create-profile-highlight.dto";
import type { UpdateProfileHighlightDto } from "./dto/update-profile-highlight.dto";
import {
  ConflictApiException,
  ForbiddenApiException,
} from "@/common/exceptions/api.exception";
import { ErrorCode } from "@/common/exceptions/error-codes";

@Injectable()
export class ProfileHighlightsService {
  constructor(
    private readonly profileHighlightsRepository: ProfileHighlightsRepository,
  ) {}

  // No profile yet means no highlights either — same "return [] rather than
  // error" precedent as WorkExperienceService.listForUser.
  async listForUser(userId: string): Promise<ProfileHighlight[]> {
    const talent =
      await this.profileHighlightsRepository.findTalentIdByUserId(userId);
    if (!talent) return [];
    return this.profileHighlightsRepository.findByTalentId(talent.id);
  }

  async create(
    userId: string,
    dto: CreateProfileHighlightDto,
  ): Promise<ProfileHighlight> {
    const talent =
      await this.profileHighlightsRepository.findTalentIdByUserId(userId);
    if (!talent) {
      throw new ForbiddenApiException(
        "Talent profile required",
        ErrorCode.TALENT_PROFILE_REQUIRED,
      );
    }

    const count = await this.profileHighlightsRepository.countByTalentIdAndType(
      talent.id,
      dto.type,
    );
    if (count >= MAX_HIGHLIGHTS_PER_TYPE) {
      throw new ConflictApiException(
        `You can add up to ${MAX_HIGHLIGHTS_PER_TYPE} ${dto.type.toLowerCase()} entries — remove one before adding another.`,
        ErrorCode.PROFILE_HIGHLIGHT_LIMIT_REACHED,
      );
    }

    return this.profileHighlightsRepository.create(talent.id, dto);
  }

  // Ownership is already enforced by ProfileHighlightOwnershipGuard before
  // these run — same division of responsibility as WorkExperienceService.
  update(
    id: string,
    dto: UpdateProfileHighlightDto,
  ): Promise<ProfileHighlight> {
    return this.profileHighlightsRepository.update(id, dto);
  }

  async remove(id: string): Promise<{ success: true }> {
    await this.profileHighlightsRepository.delete(id);
    return { success: true };
  }
}
