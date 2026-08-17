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
    workExperiences: {
      orderBy: [
        { endDate: { sort: "desc", nulls: "first" } },
        { startDate: "desc" },
      ],
    },
    profileHighlights: { orderBy: { createdAt: "asc" } },
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
    // The one flag any "Verified" badge reads — verificationEmail/
    // verificationStatus (the submission-process internals) deliberately
    // stay out of this select, same split as EmployerRepository's
    // publicProfileSelect vs profileSelect.
    isVerified: true,
    verifiedAt: true,
    // Not part of the public response shape (stripped in
    // TalentMapper.toPublicProfile) — selected here only so
    // TalentService.getPublicProfile can enforce it before the profile is
    // ever returned.
    visibility: true,
    // Not sensitive (unlike visibility itself) — a candidate's stated work
    // preferences are reasonable to surface to anyone who can already see
    // this profile, same as skills/salary below.
    primaryRole: true,
    rightToWork: true,
    employmentTypes: true,
    timezoneOverlap: true,
    noticePeriod: true,
    desiredSalaryMin: true,
    desiredSalaryMax: true,
    currency: true,
    createdAt: true,
    updatedAt: true,
    skills: { include: { skill: true } },
    // Same ordering as WorkExperienceRepository.findByTalentId — current
    // roles first, then most-recently-started.
    workExperiences: {
      orderBy: [
        { endDate: { sort: "desc", nulls: "first" } },
        { startDate: "desc" },
      ],
    },
    profileHighlights: { orderBy: { createdAt: "asc" } },
    user: { select: { name: true, image: true } },
  },
} satisfies Prisma.TalentProfileDefaultArgs;

export type PublicTalentProfile = Prisma.TalentProfileGetPayload<
  typeof publicProfileArgs
>;
