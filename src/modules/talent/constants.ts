export const RATE_LIMITS = {
  UPSERT_PROFILE: { limit: 20, windowMs: 60_000 },
} as const;
