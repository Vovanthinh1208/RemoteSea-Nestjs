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

  // Upsert + skill replacement run in one transaction — previously two separate
  // round-trips, so a failure between them could leave the profile updated but
  // its skills stale (deleted-and-not-recreated, or simply never replaced).
  upsertProfileWithSkills(
    userId: string,
    slug: string,
    data: ProfileScalarData,
    skills: { skillId: string; yearsExp?: number }[] | undefined
  ) {
    return this.prisma.$transaction(async (tx) => {
      const profile = await tx.talentProfile.upsert({
        where: { userId },
        create: { userId, slug, ...data },
        update: data,
      });

      if (skills) {
        await tx.talentSkill.deleteMany({ where: { talentId: profile.id } });
        await tx.talentSkill.createMany({
          data: skills.map((s) => ({ talentId: profile.id, skillId: s.skillId, yearsExp: s.yearsExp })),
        });
      }

      return profile;
    });
  }

  findByIdWithSkills(id: string): Promise<TalentProfileWithSkills | null> {
    return this.prisma.talentProfile.findUnique({ where: { id }, ...talentProfileWithSkillsArgs });
  }
}
