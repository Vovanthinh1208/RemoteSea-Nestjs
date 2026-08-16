import type { JobReportReason, Prisma } from "@prisma/client";

// Admin-facing shape for GET /admin/reports — enough to identify the job,
// its employer, and who filed the report, without a second round trip.
export const adminJobReportSelect = {
  id: true,
  reason: true,
  details: true,
  status: true,
  createdAt: true,
  resolvedAt: true,
  job: {
    select: {
      id: true,
      title: true,
      slug: true,
      status: true,
      employer: { select: { companyName: true } },
    },
  },
  reporter: { select: { id: true, email: true, name: true } },
} satisfies Prisma.JobReportSelect;

export type AdminJobReport = Prisma.JobReportGetPayload<{
  select: typeof adminJobReportSelect;
}>;

export type CreateJobReportInput = {
  jobId: string;
  reporterId: string;
  reason: JobReportReason;
  details: string | null;
};
