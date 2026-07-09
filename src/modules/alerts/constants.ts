import type { AlertFrequency } from "@prisma/client";

export const FREQUENCY_GAP_MS: Record<AlertFrequency, number> = {
  IMMEDIATE: 0,
  DAILY: 24 * 60 * 60 * 1000,
  WEEKLY: 7 * 24 * 60 * 60 * 1000,
};

// Caps a single cron invocation to a bounded slice of alerts (oldest-sent /
// never-sent first) instead of processing every active alert in one pass —
// keeps run time bounded as the table grows; the rest are picked up next tick.
export const MAX_ALERTS_PER_RUN = 500;

// Bounds how many alerts are sent concurrently within a run, so a large batch
// doesn't fire hundreds of simultaneous outbound email requests at once.
export const SEND_CONCURRENCY = 10;
