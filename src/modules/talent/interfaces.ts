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

// GET /talent/:slug is unauthenticated — explicit select so every public field
// is a decision, not an accident. PublicTalentProfilePage (remotesea-web)
// consumes userId (its "own profile" check) and resumeUrl (the Resume/CV link
// the owner publishes deliberately), so both stay. desiredSalaryMin/Max stay
// because TalentMapper.toPublicProfile gates them on isOpenToWork.
export const publicProfileArgs = {
  select: {
    id: true,
    userId: true,
    slug: true,
    headline: true,
    bio: true,
    location: true,
    country: true,
    timezone: true,
    yearsExperience: true,
    level: true,
    resumeUrl: true,
    portfolioUrl: true,
    githubUrl: true,
    linkedinUrl: true,
    isOpenToWork: true,
    desiredSalaryMin: true,
    desiredSalaryMax: true,
    currency: true,
    createdAt: true,
    updatedAt: true,
    skills: { include: { skill: true } },
    user: { select: { name: true, image: true } },
  },
} satisfies Prisma.TalentProfileDefaultArgs;

export type PublicTalentProfile = Prisma.TalentProfileGetPayload<
  typeof publicProfileArgs
>;
