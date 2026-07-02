import type { AlertFrequency } from "@prisma/client";

export const FREQUENCY_GAP_MS: Record<AlertFrequency, number> = {
  IMMEDIATE: 0,
  DAILY: 24 * 60 * 60 * 1000,
  WEEKLY: 7 * 24 * 60 * 60 * 1000,
};
