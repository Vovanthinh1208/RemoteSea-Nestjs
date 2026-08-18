export const RATE_LIMITS = {
  SEND_MESSAGE: { limit: 30, windowMs: 3_600_000 },
} as const;

// A job-application thread doesn't get longer than this in practice — no
// pagination for MVP, just a bounded return.
export const MESSAGES_RETURNED_CAP = 200;
