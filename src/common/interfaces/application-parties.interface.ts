import type { Prisma } from "@prisma/client";

// Shared Prisma select + structural type for "the talent/job/employer
// context of an application" — used by every per-application child-resource
// module (messages, interviews, ...) both to back their own talent-side
// ownership guard and to bundle header context (job title, employer/talent
// display names) into their GET response. Employer-side routes instead reuse
// employer/guards/application-ownership.guard.ts's ApplicationWithJobOwner,
// which satisfies this same structural shape without a common base class.
export const applicationPartiesSelect = {
  id: true,
  talent: { select: { userId: true, user: { select: { name: true } } } },
  job: {
    select: {
      title: true,
      employer: { select: { userId: true, companyName: true } },
    },
  },
} satisfies Prisma.ApplicationSelect;

export type ApplicationParties = Prisma.ApplicationGetPayload<{
  select: typeof applicationPartiesSelect;
}>;
