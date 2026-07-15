import type { Prisma } from "@prisma/client";

export const talentProfileWithSkillsArgs = {
  include: { skills: { include: { skill: true } } },
} satisfies Prisma.TalentProfileDefaultArgs;

export type TalentProfileWithSkills = Prisma.TalentProfileGetPayload<
  typeof talentProfileWithSkillsArgs
>;

export const ownProfileArgs = {
  include: {
    skills: { include: { skill: true } },
    user: { select: { name: true } },
  },
} satisfies Prisma.TalentProfileDefaultArgs;

export type OwnTalentProfile = Prisma.TalentProfileGetPayload<
  typeof ownProfileArgs
>;

// GET /talent/:slug is unauthenticated — explicit select of public-appropriate
// fields only. Notably excluded: resumeUrl (the candidate's CV is shared with
// employers they apply to, not with the whole internet) and userId (internal
// id). desiredSalaryMin/Max stay here because TalentMapper.toPublicProfile
// gates them on isOpenToWork.
export const publicProfileArgs = {
  select: {
    id: true,
    slug: true,
    headline: true,
    bio: true,
    location: true,
    country: true,
    timezone: true,
    yearsExperience: true,
    level: true,
    portfolioUrl: true,
    githubUrl: true,
    linkedinUrl: true,
    isOpenToWork: true,
    desiredSalaryMin: true,
    desiredSalaryMax: true,
    currency: true,
    createdAt: true,
    skills: { include: { skill: true } },
    user: { select: { name: true, image: true } },
  },
} satisfies Prisma.TalentProfileDefaultArgs;

export type PublicTalentProfile = Prisma.TalentProfileGetPayload<
  typeof publicProfileArgs
>;
