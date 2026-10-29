import type { ApplicationStatus, Prisma } from "@prisma/client";
import type { ApplicationParties as BaseApplicationParties } from "@/common/interfaces/application-parties.interface";

export const interviewSelect = {
  id: true,
  title: true,
  platform: true,
  durationMinutes: true,
  proposedSlots: true,
  confirmedSlot: true,
  meetingUrl: true,
  status: true,
  interviewerId: true,
  interviewer: { select: { name: true } },
  cancelReason: true,
  cancelledAt: true,
  createdAt: true,
} satisfies Prisma.InterviewSelect;

export type InterviewRecord = Prisma.InterviewGetPayload<{
  select: typeof interviewSelect;
}>;

export type UpsertInterviewInput = {
  applicationId: string;
  title: string;
  platform: string;
  durationMinutes: number;
  proposedSlots: Date[];
  meetingUrl: string;
  // undefined = "don't touch" on a re-propose (Prisma skips undefined update
  // fields) — leaves an existing assignment alone unless the caller
  // explicitly changes it.
  interviewerId: string | undefined;
};

// Shared base (same one messages/interfaces.ts's ApplicationParties re-
// exports) plus `status` — propose() needs to confirm the application has
// actually reached INTERVIEW stage, which the base shape doesn't carry.
// BaseApplicationParties already carries job.employerId (see
// application-parties.interface.ts) — used here to validate an assigned
// interviewerId belongs to the same company as the application.
export type ApplicationParties = BaseApplicationParties & {
  status: ApplicationStatus;
};

export type InterviewWithHeader = {
  interview: InterviewRecord | null;
  jobTitle: string;
  employerName: string;
  talentName: string | null;
};

// Backs GET /employer/interviews/upcoming — the one query that spans every
// application at a company instead of a single one, so it selects across
// the application -> {talent, job} relation instead of reusing
// applicationPartiesSelect (which is keyed by application id, not interview).
export const upcomingInterviewSelect = {
  id: true,
  title: true,
  applicationId: true,
  confirmedSlot: true,
  durationMinutes: true,
  meetingUrl: true,
  interviewerId: true,
  interviewer: { select: { name: true } },
  application: {
    select: {
      talent: { select: { user: { select: { name: true } } } },
      job: { select: { title: true } },
    },
  },
} satisfies Prisma.InterviewSelect;

export type UpcomingInterviewRow = Prisma.InterviewGetPayload<{
  select: typeof upcomingInterviewSelect;
}>;

// Flattened for the client — nobody outside this module needs to know the
// agenda came from Interview.application.{talent,job}.
export type UpcomingInterviewItem = {
  id: string;
  title: string | null;
  applicationId: string;
  confirmedSlot: Date;
  durationMinutes: number;
  meetingUrl: string | null;
  talentName: string | null;
  jobTitle: string;
  interviewerId: string | null;
  interviewerName: string | null;
};

// 'mine' for an INTERVIEWER-role viewer (assigned-only, same as everywhere
// else that role appears), 'team' for every other role. Decided once inside
// InterviewsService.listUpcomingForCompany, alongside the interviewerId
// filter it drives — callers (EmployerService) pass this straight through
// rather than re-deriving "is this role restricted" from the raw role a
// second time.
export type UpcomingInterviewsScope = "mine" | "team";

export type UpcomingInterviewsResult = {
  scope: UpcomingInterviewsScope;
  interviews: UpcomingInterviewItem[];
};

// E-mail addresses + display names of everyone an interview e-mail / .ics
// goes to (PB60–PB63). Loaded only when a send needs them — the parties
// shape the guards load deliberately carries no e-mail addresses.
export type InterviewContacts = {
  talent: { name: string | null; email: string; emailEnabled: boolean };
  employer: { name: string | null; email: string };
  interviewer: { name: string | null; email: string } | null;
};
