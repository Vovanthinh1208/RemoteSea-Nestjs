import type { ApplicationStatus, Prisma } from "@prisma/client";
import type { ApplicationParties as BaseApplicationParties } from "@/common/interfaces/application-parties.interface";

export const interviewSelect = {
  id: true,
  durationMinutes: true,
  proposedSlots: true,
  confirmedSlot: true,
  meetingUrl: true,
  status: true,
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
};

// Shared base (same one messages/interfaces.ts's ApplicationParties re-
// exports) plus `status` — propose() needs to confirm the application has
// actually reached INTERVIEW stage, which the base shape doesn't carry.
export type ApplicationParties = BaseApplicationParties & {
  status: ApplicationStatus;
};

export type InterviewWithHeader = {
  interview: InterviewRecord | null;
  jobTitle: string;
  employerName: string;
  talentName: string | null;
};
