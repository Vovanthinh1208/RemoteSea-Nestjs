export const RATE_LIMITS = {
  PROPOSE_INTERVIEW: { limit: 20, windowMs: 60_000 },
  CONFIRM_INTERVIEW: { limit: 20, windowMs: 60_000 },
} as const;

export const MIN_DURATION_MINUTES = 15;
export const MAX_DURATION_MINUTES = 180;
export const MAX_PROPOSED_SLOTS = 2;
