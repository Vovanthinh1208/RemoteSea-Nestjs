import { Injectable } from "@nestjs/common";
import { nanoid } from "nanoid";
import { TalentRepository } from "./talent.repository";
import { TalentMapper } from "./talent.mapper";
import type { TalentProfileDto } from "./dto/update-talent-profile.dto";
import type { OwnTalentProfile, TalentProfileWithSkills } from "./interfaces";
import { slugify } from "@/common/utils/slugify";
import { NotFoundApiException } from "@/common/exceptions/api.exception";

@Injectable()
export class TalentService {
  constructor(private readonly talentRepository: TalentRepository) {}

  async getOwnProfile(userId: string): Promise<OwnTalentProfile> {
    const profile = await this.talentRepository.findByUserId(userId);
    if (!profile) {
      throw new NotFoundApiException("Profile not found");
    }
    return profile;
  }

  async getPublicProfile(slug: string): Promise<Record<string, unknown>> {
    const profile = await this.talentRepository.findBySlug(slug);
    if (!profile) {
      throw new NotFoundApiException("Profile not found");
    }
    return TalentMapper.toPublicProfile(profile);
  }

  async upsertProfile(userId: string, dto: TalentProfileDto): Promise<TalentProfileWithSkills> {
    const { skills, ...profileData } = dto;
    const user = await this.talentRepository.findUserNameOrThrow(userId);
    const slug = `${slugify(user.name ?? "talent")}-${nanoid(6)}`;

    const profile = await this.talentRepository.upsertProfile(userId, slug, profileData);

    if (skills) {
      await this.talentRepository.replaceSkills(profile.id, skills);
    }

    return this.talentRepository.findByIdWithSkillsOrThrow(profile.id);
  }
}
