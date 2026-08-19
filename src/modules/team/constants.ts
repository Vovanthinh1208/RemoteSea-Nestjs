export const RATE_LIMITS = {
  INVITE_MEMBER: { limit: 20, windowMs: 60_000 },
  ACCEPT_INVITATION: { limit: 10, windowMs: 60_000 },
  UPDATE_MEMBER_ROLE: { limit: 30, windowMs: 60_000 },
  REMOVE_MEMBER: { limit: 30, windowMs: 60_000 },
} as const;

// Longer than the employer email-verification token's 24h window
// (employer/constants.ts) — an invited teammate may not check their inbox
// same-day, and unlike verifying an address you already control, joining a
// company is a one-time action worth giving more runway.
export const INVITATION_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;
