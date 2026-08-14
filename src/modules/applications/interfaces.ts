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
  // Application Transparency — viewedAt/statusEvents are safe to show the
  // applicant themselves (unlike `notes`): they're the timeline of their
  // own application, not anything employer-private.
  viewedAt: true,
  statusEvents: {
    select: { status: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  },
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

// Backlog-reminder cron (Employer Response SLA) — only what the digest email
// and the markRemindersSent() follow-up need, not the full applicant shape
// findApplicationsForJob's select carries.
export const backloggedApplicationSelect = {
  id: true,
  status: true,
  appliedAt: true,
  talent: { select: { user: { select: { name: true } } } },
  job: {
    select: {
      title: true,
      employer: {
        select: {
          id: true,
          companyName: true,
          user: { select: { email: true } },
        },
      },
    },
  },
} satisfies Prisma.ApplicationSelect;

export type BackloggedApplication = Prisma.ApplicationGetPayload<{
  select: typeof backloggedApplicationSelect;
}>;
