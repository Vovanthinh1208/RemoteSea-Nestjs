import type { InterviewStatus } from "@prisma/client";

export type InterviewEligibilityShape = {
  status: InterviewStatus;
  confirmedSlot: Date | null;
} | null;

// The interviews module's own domain rule for "has this interview actually
// happened" — CONFIRMED, and the confirmed slot has already passed, not just
// booked. Previously duplicated verbatim in ReviewsService and
// ScorecardsService (each independently deciding what a "complete"
// interview means); both now call this instead, so there's exactly one
// place that owns the rule — see InterviewsService.isComplete, which is how
// every other module reaches it without querying the interviews table
// itself.
export const isInterviewComplete = (
  interview: InterviewEligibilityShape,
): boolean => {
  if (
    !interview ||
    interview.status !== "CONFIRMED" ||
    !interview.confirmedSlot
  ) {
    return false;
  }
  return interview.confirmedSlot.getTime() <= Date.now();
};
