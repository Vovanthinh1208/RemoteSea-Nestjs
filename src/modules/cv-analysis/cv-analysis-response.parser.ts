import { z } from "zod";
import { CV_RECOMMENDATION_VALUES } from "@/common/constants/enum-values.constants";

// Mirrors exactly what CvAnalysisService's prompt asks the model for,
// including the "max N" caps the prompt states but can't itself enforce —
// a model that ignores the instruction and returns 10 strengths gets
// truncated here rather than silently persisting an oversized row.
const MAX_STRENGTHS = 4;
const MAX_GAPS = 4;
const MAX_SUGGESTED_QUESTIONS = 3;
const MIN_FIT_SCORE = 0;
const MAX_FIT_SCORE = 100;
const MAX_RECOMMENDATION_REASON_LENGTH = 240;

const rawAnalysisSchema = z.object({
  // Not .min/.max on fitScore itself — an out-of-range number is still a
  // real answer worth clamping and keeping (see below) rather than a reason
  // to throw away an otherwise perfectly usable analysis and force a second
  // paid LLM call.
  fitScore: z.coerce.number(),
  summary: z.string().min(1),
  strengths: z.array(z.string()).max(MAX_STRENGTHS),
  gaps: z.array(z.string()).max(MAX_GAPS),
  suggestedQuestions: z.array(z.string()).max(MAX_SUGGESTED_QUESTIONS),
  // Decision-support, not a hiring decision — see CvRecommendation's own
  // schema comment. Required (not .optional()): a response missing this
  // entirely is as malformed as one missing `summary`, so it's rejected the
  // same way rather than silently persisted as a null recommendation.
  recommendation: z.enum(CV_RECOMMENDATION_VALUES),
  recommendationReason: z.string().min(1).max(MAX_RECOMMENDATION_REASON_LENGTH),
});

export type CvAnalysisResult = z.infer<typeof rawAnalysisSchema>;

/**
 * Turns the LLM's raw text response into a trusted CvAnalysisResult, or
 * returns null if it isn't one — pure and dependency-free (no Nest, no
 * exceptions) so it's testable as plain data-in/data-out, same convention as
 * this codebase's other pure domain helpers (e.g.
 * talent-dashboard.utils.ts's buildTimelineSteps). The caller (CvAnalysisService)
 * owns turning a null result into the actual 503 the client sees.
 *
 * The model is instructed to return only JSON, but is never trusted to —
 * a stray code fence or leading sentence is common enough to guard against
 * rather than let surface as an opaque failure deeper in the stack.
 */
export const parseCvAnalysisResponse = (
  raw: string,
): CvAnalysisResult | null => {
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return null;

  let candidate: unknown;
  try {
    candidate = JSON.parse(match[0]);
  } catch {
    return null;
  }

  const result = rawAnalysisSchema.safeParse(candidate);
  if (!result.success) return null;

  return {
    ...result.data,
    fitScore: Math.max(
      MIN_FIT_SCORE,
      Math.min(MAX_FIT_SCORE, Math.round(result.data.fitScore)),
    ),
  };
};
