export const RATE_LIMITS = {
  // Spam/abuse guard, not a normal usage cap — a talent flagging a handful
  // of genuinely suspicious listings in a session won't come close to this.
  REPORT_JOB: { limit: 10, windowMs: 60 * 60_000 },
} as const;
