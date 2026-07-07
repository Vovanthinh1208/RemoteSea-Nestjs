export const RESET_TOKEN_TTL_MS = 60 * 60 * 1000;

export const RATE_LIMITS = {
  REGISTER: { limit: 5, windowMs: 60_000 },
  FORGOT_PASSWORD: { limit: 3, windowMs: 60_000 },
  RESET_PASSWORD: { limit: 5, windowMs: 60_000 },
} as const;
