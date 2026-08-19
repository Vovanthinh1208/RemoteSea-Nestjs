export const RATE_LIMITS = {
  // Duplicate-review protection (the unique constraint) already stops actual
  // spam on any one interaction — this is just a coarse defense-in-depth
  // ceiling on how many *different* reviews one account can create in a
  // burst, same reasoning as APPLY's own limit.
  CREATE_REVIEW: { limit: 10, windowMs: 60_000 },
} as const;

export const REVIEW_COMMENT_MAX_LENGTH = 2000;
