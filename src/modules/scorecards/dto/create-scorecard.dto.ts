import { z } from "zod";
import { SCORECARD_NOTE_MAX_LENGTH } from "../constants";

// PB64 AC2: each criterion is scored on a 1–5 scale.
const criterionRatingSchema = z.number().int().min(1).max(5);

export const createScorecardSchema = z.object({
  technicalRating: criterionRatingSchema,
  communicationRating: criterionRatingSchema,
  cultureFitRating: criterionRatingSchema,
  // PB64 AC3: strengths and areas to improve are both part of the form.
  strengths: z.string().trim().min(1).max(SCORECARD_NOTE_MAX_LENGTH),
  improvements: z.string().trim().min(1).max(SCORECARD_NOTE_MAX_LENGTH),
  // PB64 AC4: the five-point recommendation scale.
  recommendation: z.enum([
    "STRONGLY_RECOMMEND",
    "RECOMMEND",
    "NEUTRAL",
    "NOT_RECOMMEND",
    "STRONGLY_NOT_RECOMMEND",
  ]),
  // trim() then min(1): an explicit empty/whitespace-only note is rejected
  // rather than silently accepted as "no note" — same reasoning as
  // CreateReviewDto.comment.
  note: z.string().trim().min(1).max(SCORECARD_NOTE_MAX_LENGTH).optional(),
});

export type CreateScorecardDto = z.infer<typeof createScorecardSchema>;
