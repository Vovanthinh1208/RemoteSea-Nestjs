export const RATE_LIMITS = {
  UPSERT_PROFILE: { limit: 20, windowMs: 60_000 },
  SUBMIT_VERIFICATION: { limit: 5, windowMs: 60_000 },
} as const;

// PB22 requires email-verification links to remain valid for 24 hours.
export const VERIFICATION_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;
