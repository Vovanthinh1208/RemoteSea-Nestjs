export const RATE_LIMITS = {
  CREATE: { limit: 10, windowMs: 60_000 },
  UPDATE: { limit: 20, windowMs: 60_000 },
} as const;
