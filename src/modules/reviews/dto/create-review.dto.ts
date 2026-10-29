import { z } from "zod";
import {
  REVIEW_COMMENT_MAX_LENGTH,
  REVIEW_COMMENT_MIN_LENGTH,
  REVIEW_TITLE_MAX_LENGTH,
} from "../constants";

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
  // PB71 AC3: a title and a detailed comment of at least 20 characters
  // (counted after trimming) are both required.
  title: z.string().trim().min(1).max(REVIEW_TITLE_MAX_LENGTH),
  comment: z
    .string()
    .trim()
    .min(REVIEW_COMMENT_MIN_LENGTH)
    .max(REVIEW_COMMENT_MAX_LENGTH),
});

export type CreateReviewDto = z.infer<typeof createReviewSchema>;
