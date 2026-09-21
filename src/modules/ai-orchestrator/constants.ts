export const RATE_LIMITS = {
  // Each call proxies through to a real LLM completion (up to
  // ORCHESTRATOR_CALL_TIMEOUT_MS = 180s) at remotesea-ai — unlike every
  // other route on this controller, this is a direct, uncapped cost driver
  // that previously had no rate limit at all. 20/5min comfortably covers a
  // real back-and-forth chat session while bounding the cost of a scripted
  // abuse loop.
  CHAT: { limit: 20, windowMs: 5 * 60_000 },
  // Plain Postgres reads at remotesea-ai (no LLM call) — a much cheaper
  // operation than CHAT, but previously had no ceiling at all, unlike every
  // other list/detail endpoint in this app. Generous enough that a real
  // client (opening the chat panel, switching between conversations) never
  // feels it, while still bounding a scripted loop.
  LIST_CONVERSATIONS: { limit: 60, windowMs: 60_000 },
  GET_CONVERSATION: { limit: 60, windowMs: 60_000 },
} as const;
