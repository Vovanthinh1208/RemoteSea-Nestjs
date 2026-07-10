import type {
  Job,
  EmployerProfile,
  Skill,
  Category,
  Prisma,
} from "@prisma/client";

export type JobWithRelations = Job & {
  employer: Pick<
    EmployerProfile,
    "companyName" | "logoUrl" | "slug" | "isVerified"
  >;
  skills: Array<{ skill: Skill; isRequired: boolean }>;
  categories: Array<{ category: Category }>;
};

export const jobWithRelationsInclude = {
  // isVerified drives the "Verified" badge on every card that renders this
  // include (saved jobs, applications) — previously missing here even though
  // the /jobs list and detail selects both include it, so the badge silently
  // never rendered for saved-job/application job cards.
  employer: {
    select: { companyName: true, logoUrl: true, slug: true, isVerified: true },
  },
  categories: { include: { category: true } },
  skills: { include: { skill: true } },
} satisfies Prisma.JobInclude;

export type PublicJobWithRelations = Omit<
  JobWithRelations,
  "stripeSessionId" | "reviewNote"
>;

// stripeSessionId (a Stripe payment identifier) and reviewNote (the admin's
// internal rejection note) are never meant to reach any client response — Prisma's
// `omit` query option isn't usable on this client's generated types (rejects it at
// the type level even after `prisma generate`), so strip them manually wherever a
// query built on jobWithRelationsInclude reaches an HTTP response body.
export const omitInternalJobFields = <
  T extends { stripeSessionId: string | null; reviewNote: string | null },
>({
  stripeSessionId: _stripeSessionId,
  reviewNote: _reviewNote,
  ...rest
}: T): Omit<T, "stripeSessionId" | "reviewNote"> => {
  return rest;
};
