import type { Prisma } from "@prisma/client";

// The narrow "job card" shape shared by every list endpoint that embeds jobs
// (GET /jobs, GET /saved, GET /applications) — only the fields their frontend
// consumers actually render. Lives here (not in the jobs module) for the same
// reason as job-with-relations.type.ts: saved/applications need it too, and
// the Prisma.JobGetPayload type below must stay colocated with its select.
export const jobListItemSelect = {
  id: true,
  title: true,
  jobType: true,
  level: true,
  salaryMin: true,
  salaryMax: true,
  currency: true,
  isRemote: true,
  timezone: true,
  country: true,
  isFeatured: true,
  vnHireCount: true,
  publishedAt: true,
  createdAt: true,
  // slug backs the company profile link on JobCard (GET /companies/:slug).
  employer: { select: { companyName: true, isVerified: true, slug: true } },
  categories: {
    select: {
      category: { select: { id: true, name: true, slug: true, icon: true } },
    },
  },
  skills: {
    select: {
      isRequired: true,
      skill: { select: { id: true, name: true, slug: true } },
    },
  },
} satisfies Prisma.JobSelect;

export type JobListItem = Prisma.JobGetPayload<{
  select: typeof jobListItemSelect;
}>;
