export const RATE_LIMITS = {
  CHANGE_PASSWORD: { limit: 5, windowMs: 60_000 },
  EXPORT: { limit: 3, windowMs: 60_000 },
} as const;
