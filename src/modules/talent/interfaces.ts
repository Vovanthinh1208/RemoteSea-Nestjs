import type { Prisma } from "@prisma/client";

export const talentProfileWithSkillsArgs = {
  include: { skills: { include: { skill: true } } },
} satisfies Prisma.TalentProfileDefaultArgs;

export type TalentProfileWithSkills = Prisma.TalentProfileGetPayload<typeof talentProfileWithSkillsArgs>;

export const ownProfileArgs = {
  include: { skills: { include: { skill: true } }, user: { select: { name: true } } },
} satisfies Prisma.TalentProfileDefaultArgs;

export type OwnTalentProfile = Prisma.TalentProfileGetPayload<typeof ownProfileArgs>;

export const publicProfileArgs = {
  include: { skills: { include: { skill: true } }, user: { select: { name: true, image: true } } },
} satisfies Prisma.TalentProfileDefaultArgs;

export type PublicTalentProfile = Prisma.TalentProfileGetPayload<typeof publicProfileArgs>;
