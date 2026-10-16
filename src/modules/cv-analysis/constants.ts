export const RATE_LIMITS = {
  // Each call is a paid LLM request (plus a PDF fetch/parse) triggered by a
  // single "open this applicant" click — a much lower ceiling than a plain
  // CRUD write like CREATE_SCORECARD warrants.
  GET_CV_ANALYSIS: { limit: 20, windowMs: 60_000 },
  REGENERATE: { limit: 1, windowMs: 30_000 },
} as const;

// Resumes are capped at upload time (see uploads/constants.ts
// MAX_FILE_SIZE_BYTES.resume), but that cap is generous for a PDF viewer —
// this is a second, tighter cap on what actually gets sent to the LLM, so
// one outlier upload can't blow the per-request token budget/cost.
export const MAX_RESUME_BYTES = 5 * 1024 * 1024;
export const MAX_RESUME_TEXT_CHARS = 15_000;

// No model constant here anymore — which model answers depends on which
// AiProvider is active (AI_PROVIDER=ANTHROPIC|GEMINI), a decision that
// belongs entirely to AiService/the provider, not this feature. See
// CvAnalysisService.analyze, which persists whatever model AiService says
// actually answered.
export const CV_ANALYSIS_MAX_TOKENS = 1024;
