// Shared by both save and unsave — they're the same conceptual user action
// (toggling a job's saved state) and a rapid save/unsave loop should count
// against one combined budget, not two separate ones.
export const RATE_LIMITS = {
  TOGGLE: { limit: 30, windowMs: 60_000 },
} as const;
