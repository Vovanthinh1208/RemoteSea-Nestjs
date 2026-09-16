export const RESET_TOKEN_TTL_MS = 60 * 60 * 1000;

// otplib's `authenticator.keyuri` issuer label — shown in the user's
// authenticator app next to the account name.
export const TWO_FACTOR_ISSUER = "RemoteSEA";

export const RATE_LIMITS = {
  REGISTER: { limit: 5, windowMs: 60_000 },
  LOGIN: { limit: 10, windowMs: 60_000 },
  FORGOT_PASSWORD: { limit: 3, windowMs: 60_000 },
  RESET_PASSWORD: { limit: 5, windowMs: 60_000 },
  // Brute-forcing a 6-digit TOTP code is only ~1M guesses — this is the
  // control that actually matters, tighter than plain LOGIN.
  TWO_FACTOR_CHALLENGE: { limit: 10, windowMs: 5 * 60_000 },
  // Same 6-digit-TOTP guessing risk as TWO_FACTOR_CHALLENGE above, just
  // post-login (confirming a fresh setup) instead of pre-login.
  TWO_FACTOR_VERIFY: { limit: 10, windowMs: 5 * 60_000 },
  // Tighter than LOGIN — a valid JWT plus an unrated password check here was
  // an unlimited-guess account-takeover-and-2FA-removal path (a stolen
  // token never expires the account's actual password).
  TWO_FACTOR_DISABLE: { limit: 5, windowMs: 5 * 60_000 },
} as const;
