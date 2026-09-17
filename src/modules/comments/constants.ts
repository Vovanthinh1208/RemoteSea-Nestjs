export const RATE_LIMITS = {
  // No unique constraint backstops this the way scorecards' does — a coarse
  // ceiling on burst posting is the only thing standing between this and an
  // unbounded write loop.
  CREATE_COMMENT: { limit: 30, windowMs: 60_000 },
} as const;

export const COMMENT_BODY_MAX_LENGTH = 4000;
