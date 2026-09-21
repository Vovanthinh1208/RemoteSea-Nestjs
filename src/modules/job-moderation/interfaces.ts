import type { Prisma } from "@prisma/client";

export const jobModerationFlagSelect = {
  id: true,
  riskLevel: true,
  reasons: true,
  summary: true,
  model: true,
  createdAt: true,
} satisfies Prisma.JobModerationFlagSelect;

export type JobModerationFlag = Prisma.JobModerationFlagGetPayload<{
  select: typeof jobModerationFlagSelect;
}>;

export type CreateJobModerationFlagInput = {
  jobId: string;
  riskLevel: JobModerationFlag["riskLevel"];
  reasons: string[];
  summary: string;
  model: string;
};

export type JobModerationSource = {
  title: string;
  description: string;
  requirements: string | null;
  salaryMin: number | null;
  salaryMax: number | null;
  currency: string;
  country: string | null;
  isRemote: boolean;
  employer: { companyName: string };
} | null;
