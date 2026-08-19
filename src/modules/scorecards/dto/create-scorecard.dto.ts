import { z } from "zod";
import { SCORECARD_NOTE_MAX_LENGTH } from "../constants";

export const createScorecardSchema = z.object({
  recommendation: z.enum(["STRONG_YES", "YES", "NO", "STRONG_NO"]),
  // trim() then min(1): an explicit empty/whitespace-only note is rejected
  // rather than silently accepted as "no note" — same reasoning as
  // CreateReviewDto.comment.
  note: z.string().trim().min(1).max(SCORECARD_NOTE_MAX_LENGTH).optional(),
});

export type CreateScorecardDto = z.infer<typeof createScorecardSchema>;
