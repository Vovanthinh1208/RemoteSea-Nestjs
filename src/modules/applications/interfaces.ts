import type { Application } from "@prisma/client";
import type { JobWithRelations } from "@/common/types/job-with-relations.type";

export type ApplicationWithJob = Application & { job: JobWithRelations };

export type CreateApplicationInput = {
  jobId: string;
  talentId: string;
  coverLetter?: string;
  resumeUrl?: string;
};
