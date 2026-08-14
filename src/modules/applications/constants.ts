export const RATE_LIMITS = {
  APPLY: { limit: 10, windowMs: 60_000 },
} as const;

// Backlog-reminder cron thresholds (Application Transparency / Employer
// Response SLA) — how long an application can sit in a stage before it's
// considered stuck. Named constants so they're easy to retune without
// hunting through the query that uses them.
export const BACKLOG_THRESHOLD_MS = {
  PENDING: 3 * 24 * 60 * 60 * 1000,
  REVIEWING: 7 * 24 * 60 * 60 * 1000,
} as const;

// Don't re-email the same employer about the same still-stuck application
// every single run — only after this much time since the last reminder.
export const BACKLOG_REMINDER_COOLDOWN_MS = 3 * 24 * 60 * 60 * 1000;

// Same reasoning as alerts' SEND_CONCURRENCY — bounds simultaneous outbound
// digest emails within one cron run.
export const SEND_CONCURRENCY = 10;

// Same reasoning as alerts' MAX_ALERTS_PER_RUN — caps one cron invocation to
// a bounded slice so run time stays bounded as the table grows; the rest are
// picked up next tick (each already-reminded row's cooldown just means it
// naturally rotates out of contention for the next run's slice).
export const BACKLOG_MAX_PER_RUN = 500;
