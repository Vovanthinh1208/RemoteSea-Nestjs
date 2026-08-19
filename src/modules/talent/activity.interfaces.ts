import type { Prisma } from "@prisma/client";

// Narrow selects for GET /talent/me/activity — each source table already
// exists for its own feature (status history, messaging, interviews,
// invitations); this endpoint only reads them, it doesn't add new writes or
// new tables. See activity.util.ts for how these four shapes become one
// merged, sorted feed.

export const statusEventActivitySelect = {
  id: true,
  status: true,
  createdAt: true,
  application: {
    select: {
      id: true,
      job: {
        select: { title: true, employer: { select: { companyName: true } } },
      },
    },
  },
} satisfies Prisma.ApplicationStatusEventSelect;

export type StatusEventActivitySource =
  Prisma.ApplicationStatusEventGetPayload<{
    select: typeof statusEventActivitySelect;
  }>;

export const messageActivitySelect = {
  id: true,
  body: true,
  createdAt: true,
  application: {
    select: {
      id: true,
      job: {
        select: { title: true, employer: { select: { companyName: true } } },
      },
    },
  },
} satisfies Prisma.MessageSelect;

export type MessageActivitySource = Prisma.MessageGetPayload<{
  select: typeof messageActivitySelect;
}>;

export const interviewActivitySelect = {
  id: true,
  status: true,
  createdAt: true,
  updatedAt: true,
  application: {
    select: {
      id: true,
      job: {
        select: { title: true, employer: { select: { companyName: true } } },
      },
    },
  },
} satisfies Prisma.InterviewSelect;

export type InterviewActivitySource = Prisma.InterviewGetPayload<{
  select: typeof interviewActivitySelect;
}>;

export const invitationActivitySelect = {
  id: true,
  createdAt: true,
  job: {
    select: {
      id: true,
      title: true,
      employer: { select: { companyName: true } },
    },
  },
} satisfies Prisma.JobInvitationSelect;

export type InvitationActivitySource = Prisma.JobInvitationGetPayload<{
  select: typeof invitationActivitySelect;
}>;

export type ActivityItemType =
  | "APPLICATION_STATUS_CHANGED"
  | "MESSAGE_RECEIVED"
  | "INTERVIEW_PROPOSED"
  | "INTERVIEW_CONFIRMED"
  | "INVITATION_RECEIVED";

// Same flat shape as notifications/interfaces.ts's NotificationListItem
// (id/type/title/body/link/createdAt) — this feed has no persisted row and
// no read state, so it's the same contract minus `readAt`.
export type ActivityItem = {
  id: string;
  type: ActivityItemType;
  title: string;
  body: string | null;
  link: string;
  createdAt: Date;
};
