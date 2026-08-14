import type { Prisma } from "@prisma/client";

// The narrow "candidate card" shape for GET /talent (employer talent search).
// visibility/isOpenToWork are deliberately not selected — both are enforced
// entirely in talent-search.util.ts's where clause, never rendered, same
// convention as jobListItemSelect omitting internal-only fields.
export const talentSearchItemSelect = {
  id: true,
  slug: true,
  headline: true,
  level: true,
  country: true,
  timezone: true,
  yearsExperience: true,
  desiredSalaryMin: true,
  desiredSalaryMax: true,
  currency: true,
  employmentTypes: true,
  timezoneOverlap: true,
  noticePeriod: true,
  updatedAt: true,
  user: { select: { name: true, image: true } },
  skills: {
    select: { skill: { select: { id: true, name: true, slug: true } } },
  },
} satisfies Prisma.TalentProfileSelect;

export type TalentSearchItem = Prisma.TalentProfileGetPayload<{
  select: typeof talentSearchItemSelect;
}>;
