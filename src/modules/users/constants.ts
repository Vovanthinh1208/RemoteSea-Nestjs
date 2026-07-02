export const BCRYPT_SALT_ROUNDS = 12;

export const RATE_LIMITS = {
  CHANGE_PASSWORD: { limit: 5, windowMs: 60_000 },
} as const;
