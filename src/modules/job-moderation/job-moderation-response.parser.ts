import { z } from "zod";
import { JOB_MODERATION_RISK_LEVEL_VALUES } from "@/common/constants/enum-values.constants";

// Mirrors exactly what JobModerationService's prompt asks the model for,
// including the "max N" cap the prompt states but can't itself enforce — a
// model that ignores the instruction and returns 10 reasons gets truncated
// here rather than silently persisting an oversized row.
const MAX_REASONS = 5;

const rawFlagSchema = z.object({
  riskLevel: z.enum(JOB_MODERATION_RISK_LEVEL_VALUES),
  reasons: z.array(z.string()).max(MAX_REASONS),
  summary: z.string().min(1),
});

export type JobModerationFlagResult = z.infer<typeof rawFlagSchema>;

/**
 * Turns the LLM's raw text response into a trusted JobModerationFlagResult,
 * or returns null if it isn't one — pure and dependency-free (no Nest, no
 * exceptions), same convention as cv-analysis-response.parser.ts. The
 * caller (JobModerationService) owns turning a null result into the actual
 * 503 the client sees.
 *
 * The model is instructed to return only JSON, but is never trusted to — a
 * stray code fence or leading sentence is common enough to guard against
 * rather than let surface as an opaque failure deeper in the stack.
 */
export const parseJobModerationResponse = (
  raw: string,
): JobModerationFlagResult | null => {
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return null;

  let candidate: unknown;
  try {
    candidate = JSON.parse(match[0]);
  } catch {
    return null;
  }

  const result = rawFlagSchema.safeParse(candidate);
  return result.success ? result.data : null;
};
