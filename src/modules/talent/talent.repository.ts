import { Injectable } from "@nestjs/common";
import type { User } from "@prisma/client";
import { PrismaService } from "@/core/database/prisma.service";
import type { TalentProfileDto } from "./dto/update-talent-profile.dto";
import {
  ownProfileArgs,
  publicProfileArgs,
  talentProfileWithSkillsArgs,
  type OwnTalentProfile,
  type PublicTalentProfile,
  type TalentProfileWithSkills,
} from "./interfaces";

type ProfileScalarData = Omit<TalentProfileDto, "skills">;

@Injectable()
export class TalentRepository {
  constructor(private readonly prisma: PrismaService) {}

  findByUserId(userId: string): Promise<OwnTalentProfile | null> {
    return this.prisma.talentProfile.findUnique({ where: { userId }, ...ownProfileArgs });
  }

  findBySlug(slug: string): Promise<PublicTalentProfile | null> {
    return this.prisma.talentProfile.findUnique({ where: { slug }, ...publicProfileArgs });
  }

  findUserName(userId: string): Promise<Pick<User, "name"> | null> {
    return this.prisma.user.findUnique({ where: { id: userId }, select: { name: true } });
  }

  upsertProfile(userId: string, slug: string, data: ProfileScalarData) {
    return this.prisma.talentProfile.upsert({
      where: { userId },
      create: { userId, slug, ...data },
      update: data,
    });
  }

  async replaceSkills(
    talentId: string,
    skills: { skillId: string; yearsExp?: number }[]
  ): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.talentSkill.deleteMany({ where: { talentId } }),
      this.prisma.talentSkill.createMany({
        data: skills.map((s) => ({ talentId, skillId: s.skillId, yearsExp: s.yearsExp })),
      }),
    ]);
  }

  findByIdWithSkills(id: string): Promise<TalentProfileWithSkills | null> {
    return this.prisma.talentProfile.findUnique({ where: { id }, ...talentProfileWithSkillsArgs });
  }
}
