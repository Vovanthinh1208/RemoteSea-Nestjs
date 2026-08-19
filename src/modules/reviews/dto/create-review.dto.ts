import { z } from "zod";
import { REVIEW_COMMENT_MAX_LENGTH } from "../constants";

const ratingSchema = z.number().int().min(1).max(5);

export const createReviewSchema = z.object({
  applicationId: z.string().cuid(),
  overallRating: ratingSchema,
  // Which of these are actually valid depends on the review's direction
  // (talent-vs-employer categories) — that's only known once the service
  // loads the application and resolves who the reviewer is, so it can't be
  // encoded here; see ReviewsService.create's direction-specific checks.
  communicationRating: ratingSchema.optional(),
  professionalismRating: ratingSchema.optional(),
  interviewProcessRating: ratingSchema.optional(),
  reliabilityRating: ratingSchema.optional(),
  // trim() then min(1): an explicit empty/whitespace-only comment is
  // rejected rather than silently accepted as "no comment" — the field
  // being present at all means the caller meant to say something.
  comment: z.string().trim().min(1).max(REVIEW_COMMENT_MAX_LENGTH).optional(),
});

export type CreateReviewDto = z.infer<typeof createReviewSchema>;
