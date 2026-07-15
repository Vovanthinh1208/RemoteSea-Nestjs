import type { Prisma } from "@prisma/client";
import type { JobListItem } from "@/common/types/job-list-item.type";

// The talent-facing application scalars — everything except `notes`, which is
// the employer's private note on the candidate (written via
// PATCH /employer/applications/:id) and must never be serialized back to the
// applicant themselves.
export const ownApplicationSelect = {
  id: true,
  jobId: true,
  talentId: true,
  coverLetter: true,
  resumeUrl: true,
  status: true,
  appliedAt: true,
  updatedAt: true,
} satisfies Prisma.ApplicationSelect;

export type OwnApplication = Prisma.ApplicationGetPayload<{
  select: typeof ownApplicationSelect;
}>;

export type ApplicationWithJob = OwnApplication & { job: JobListItem };

export type CreateApplicationInput = {
  jobId: string;
  talentId: string;
  coverLetter?: string;
  resumeUrl?: string;
};
