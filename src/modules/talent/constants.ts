export const RATE_LIMITS = {
  UPSERT_PROFILE: { limit: 20, windowMs: 60_000 },
  SUBMIT_VERIFICATION: { limit: 5, windowMs: 60_000 },
} as const;

// Shorter than employer's 24h window — a personal inbox is checked more
// reflexively than a shared company one.
export const VERIFICATION_TOKEN_TTL_MS = 60 * 60 * 1000;
