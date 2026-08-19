import type { ApplicationStatus, Prisma } from "@prisma/client";
import type { ApplicationParties as BaseApplicationParties } from "@/common/interfaces/application-parties.interface";

export const interviewSelect = {
  id: true,
  durationMinutes: true,
  proposedSlots: true,
  confirmedSlot: true,
  meetingUrl: true,
  status: true,
  interviewerId: true,
  interviewer: { select: { name: true } },
  createdAt: true,
} satisfies Prisma.InterviewSelect;

export type InterviewRecord = Prisma.InterviewGetPayload<{
  select: typeof interviewSelect;
}>;

export type UpsertInterviewInput = {
  applicationId: string;
  durationMinutes: number;
  proposedSlots: Date[];
  meetingUrl: string | undefined;
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
