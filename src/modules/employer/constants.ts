import type { ApplicationStatus } from "@prisma/client";

export const RATE_LIMITS = {
  CREATE_PROFILE: { limit: 5, windowMs: 60_000 },
  UPDATE_PROFILE: { limit: 20, windowMs: 60_000 },
  UPDATE_APPLICATION: { limit: 30, windowMs: 60_000 },
} as const;

export const ALLOWED_TRANSITIONS: Record<
  ApplicationStatus,
  ApplicationStatus[]
> = {
  PENDING: ["REVIEWING", "REJECTED"],
  REVIEWING: ["SHORTLISTED", "REJECTED"],
  SHORTLISTED: ["INTERVIEW", "REJECTED"],
  INTERVIEW: ["OFFERED", "REJECTED"],
  OFFERED: ["REJECTED"],
  REJECTED: [],
  WITHDRAWN: [],
};
