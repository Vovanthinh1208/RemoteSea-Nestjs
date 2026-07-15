import type { Application } from "@prisma/client";
import type { JobListItem } from "@/common/types/job-list-item.type";

export type ApplicationWithJob = Application & { job: JobListItem };

export type CreateApplicationInput = {
  jobId: string;
  talentId: string;
  coverLetter?: string;
  resumeUrl?: string;
};
