import type { Job, Prisma } from "@prisma/client";

export type JobWithEmployerEmail = Job & { employer: { user: { email: string } } };

export const jobWithEmployerEmailInclude = {
  employer: { include: { user: { select: { email: true } } } },
} satisfies Prisma.JobInclude;
