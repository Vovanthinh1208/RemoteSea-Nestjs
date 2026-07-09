import { Injectable } from "@nestjs/common";
import { TalentRepository } from "./talent.repository";
import { TalentMapper } from "./talent.mapper";
import type { TalentProfileDto } from "./dto/update-talent-profile.dto";
import type { OwnTalentProfile, TalentProfileWithSkills } from "./interfaces";
import { uniqueSlug } from "@/common/utils/slugify";
import { assertFound } from "@/common/utils/assert-found";

@Injectable()
export class TalentService {
  constructor(private readonly talentRepository: TalentRepository) {}

  async getOwnProfile(userId: string): Promise<OwnTalentProfile> {
    const profile = await this.talentRepository.findByUserId(userId);
    assertFound(profile, "Profile not found");
    return profile;
  }

  async getPublicProfile(slug: string): Promise<Record<string, unknown>> {
    const profile = await this.talentRepository.findBySlug(slug);
    assertFound(profile, "Profile not found");
    return TalentMapper.toPublicProfile(profile);
  }

  async upsertProfile(userId: string, dto: TalentProfileDto): Promise<TalentProfileWithSkills> {
    const { skills, ...profileData } = dto;
    const user = await this.talentRepository.findUserName(userId);
    assertFound(user, "User not found");
    const slug = uniqueSlug(user.name ?? "talent");

    const profile = await this.talentRepository.upsertProfileWithSkills(userId, slug, profileData, skills);

    const updated = await this.talentRepository.findByIdWithSkills(profile.id);
    assertFound(updated, "Profile not found");
    return updated;
  }
}
