import { z } from "zod";
import { COMMENT_BODY_MAX_LENGTH } from "../constants";

export const createCommentSchema = z.object({
  // trim() then min(1): an explicit empty/whitespace-only comment is
  // rejected rather than silently accepted, same convention as
  // CreateScorecardDto.note.
  body: z.string().trim().min(1).max(COMMENT_BODY_MAX_LENGTH),
});

export type CreateCommentDto = z.infer<typeof createCommentSchema>;
