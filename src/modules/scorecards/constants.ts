export const RATE_LIMITS = {
  // Same reasoning as reviews' CREATE_REVIEW: the unique constraint already
  // stops one author double-submitting on the same interview — this is just
  // a coarse ceiling on how many different scorecards one account can create
  // in a burst.
  CREATE_SCORECARD: { limit: 10, windowMs: 60_000 },
} as const;

export const SCORECARD_NOTE_MAX_LENGTH = 2000;
