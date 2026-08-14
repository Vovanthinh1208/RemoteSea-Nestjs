export const RATE_LIMITS = {
  // Spam guard, not a normal usage cap — an employer reasonably browsing
  // Talent Search and inviting good matches won't come close to this.
  SEND: { limit: 20, windowMs: 60 * 60_000 },
} as const;
