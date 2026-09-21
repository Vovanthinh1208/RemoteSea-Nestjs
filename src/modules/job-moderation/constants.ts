export const RATE_LIMITS = {
  // Each call is a paid LLM request triggered by a single "run AI risk
  // check" click in the admin queue — same reasoning/ceiling as
  // cv-analysis/constants.ts's GET_CV_ANALYSIS.
  GET_MODERATION_FLAG: { limit: 20, windowMs: 60_000 },
} as const;

// No model constant here — same reasoning as CV_ANALYSIS_MAX_TOKENS: which
// model answers is AiService/the provider's decision, not this feature's.
export const JOB_MODERATION_MAX_TOKENS = 512;
