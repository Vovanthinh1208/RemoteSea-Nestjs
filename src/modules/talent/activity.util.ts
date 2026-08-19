import { APPLICATION_STATUS_LABELS } from "@/modules/employer/constants";
import type {
  ActivityItem,
  InterviewActivitySource,
  InvitationActivitySource,
  MessageActivitySource,
  StatusEventActivitySource,
} from "./activity.interfaces";

// One feed capped at this many items overall; also used as the per-source
// fetch limit, since in the worst case (one source dominates) that many rows
// from a single table is already enough to fill the merged feed.
export const ACTIVITY_FEED_LIMIT = 20;

const MESSAGE_PREVIEW_MAX_LENGTH = 140;

const truncate = (text: string, maxLength: number): string =>
  text.length > maxLength ? `${text.slice(0, maxLength).trimEnd()}…` : text;

const jobLine = (job: { title: string; employer: { companyName: string } }) =>
  `${job.title} at ${job.employer.companyName}`;

/** Excludes PENDING upstream (see TalentRepository.findRecentStatusEvents) —
 * that event is the applicant's own action, not something that happened to
 * them, so it isn't "activity" in the sense this feed reports. */
export const statusEventsToActivity = (
  events: StatusEventActivitySource[],
): ActivityItem[] =>
  events.map((event) => ({
    id: event.id,
    type: "APPLICATION_STATUS_CHANGED",
    title: APPLICATION_STATUS_LABELS[event.status],
    body: jobLine(event.application.job),
    link: `/applications/${event.application.id}`,
    createdAt: event.createdAt,
  }));

export const messagesToActivity = (
  messages: MessageActivitySource[],
): ActivityItem[] =>
  messages.map((message) => ({
    id: message.id,
    type: "MESSAGE_RECEIVED",
    title: "New message",
    body: `${jobLine(message.application.job)}: "${truncate(message.body, MESSAGE_PREVIEW_MAX_LENGTH)}"`,
    link: `/applications/${message.application.id}/messages`,
    createdAt: message.createdAt,
  }));

// The Interview model has no history table (one row per application, see
// its schema comment) — so a CONFIRMED interview surfaces as two separate
// feed entries (proposed, then confirmed) derived from the same row's
// createdAt/updatedAt rather than as two rows read from the database. A
// still-PENDING interview only produces the first.
export const interviewsToActivity = (
  interviews: InterviewActivitySource[],
): ActivityItem[] =>
  interviews.flatMap((interview) => {
    const link = `/applications/${interview.application.id}/interview`;
    const body = jobLine(interview.application.job);
    const items: ActivityItem[] = [
      {
        id: `${interview.id}:proposed`,
        type: "INTERVIEW_PROPOSED",
        title: "Interview proposed",
        body,
        link,
        createdAt: interview.createdAt,
      },
    ];
    if (interview.status === "CONFIRMED") {
      items.push({
        id: `${interview.id}:confirmed`,
        type: "INTERVIEW_CONFIRMED",
        title: "Interview confirmed",
        body,
        link,
        createdAt: interview.updatedAt,
      });
    }
    return items;
  });

export const invitationsToActivity = (
  invitations: InvitationActivitySource[],
): ActivityItem[] =>
  invitations.map((invitation) => ({
    id: invitation.id,
    type: "INVITATION_RECEIVED",
    title: "Job invitation",
    body: `${jobLine(invitation.job)} invited you to apply`,
    link: `/jobs/${invitation.job.id}`,
    createdAt: invitation.createdAt,
  }));

/** Newest first across every source, capped at ACTIVITY_FEED_LIMIT — the
 * merge step each per-source fetch is capped for is safe to do in memory
 * since none of the four inputs exceeds that same limit. */
export const mergeActivity = (...sources: ActivityItem[][]): ActivityItem[] =>
  sources
    .flat()
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .slice(0, ACTIVITY_FEED_LIMIT);
