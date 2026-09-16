export const RATE_LIMITS = {
  // Each call proxies through to a real LLM completion (up to
  // ORCHESTRATOR_CALL_TIMEOUT_MS = 180s) at remotesea-ai — unlike every
  // other route on this controller, this is a direct, uncapped cost driver
  // that previously had no rate limit at all. 20/5min comfortably covers a
  // real back-and-forth chat session while bounding the cost of a scripted
  // abuse loop.
  CHAT: { limit: 20, windowMs: 5 * 60_000 },
} as const;
