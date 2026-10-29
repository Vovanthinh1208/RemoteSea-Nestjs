import type { Prisma, ReviewDirection, InterviewStatus } from "@prisma/client";
import {
  applicationPartiesSelect,
  type ApplicationParties,
} from "@/common/interfaces/application-parties.interface";

// Reuses the shared talent/job/employer shape every other per-application
// module (messages, interviews) already builds on, plus the two extra
// fields this module's eligibility rule needs — see the Review model's
// schema comment for why "CONFIRMED and the slot has passed" is the source
// of truth, not Application.status.
// PB70 partner lookup: every application linking the caller and the partner,
// with the interview fields the eligibility rule needs.
export const partnerApplicationSelect = {
  id: true,
  talent: { select: { userId: true } },
  job: { select: { employer: { select: { userId: true } } } },
  interview: { select: { status: true, confirmedSlot: true } },
} satisfies Prisma.ApplicationSelect;

export type PartnerApplication = Prisma.ApplicationGetPayload<{
  select: typeof partnerApplicationSelect;
}>;

export const reviewApplicationSelect = {
  ...applicationPartiesSelect,
  interview: { select: { status: true, confirmedSlot: true } },
} satisfies Prisma.ApplicationSelect;

export type ReviewApplicationContext = ApplicationParties & {
  interview: { status: InterviewStatus; confirmedSlot: Date | null } | null;
};

export const reviewListItemSelect = {
  id: true,
  direction: true,
  overallRating: true,
  communicationRating: true,
  professionalismRating: true,
  interviewProcessRating: true,
  reliabilityRating: true,
  title: true,
  comment: true,
  createdAt: true,
  // Public display label for the reviewer: a talent's own name, or the
  // reviewing employer's company name — never exposes which specific person
  // at the company wrote it.
  reviewer: {
    select: {
      name: true,
      employer: { select: { companyName: true } },
    },
  },
} satisfies Prisma.ReviewSelect;

export type ReviewListItem = Prisma.ReviewGetPayload<{
  select: typeof reviewListItemSelect;
}>;

export type CreateReviewInput = {
  applicationId: string;
  direction: ReviewDirection;
  reviewerId: string;
  revieweeId: string;
  overallRating: number;
  communicationRating?: number;
  professionalismRating?: number;
  interviewProcessRating?: number;
  reliabilityRating?: number;
  title: string;
  comment: string;
};

export type ReviewRatingAverages = {
  overallRating: number | null;
  communicationRating: number | null;
  professionalismRating: number | null;
  interviewProcessRating: number | null;
  reliabilityRating: number | null;
};
