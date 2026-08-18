import type { ApplicationStatus } from "@prisma/client";

export const RATE_LIMITS = {
  CREATE_PROFILE: { limit: 5, windowMs: 60_000 },
  UPDATE_PROFILE: { limit: 20, windowMs: 60_000 },
  UPDATE_APPLICATION: { limit: 30, windowMs: 60_000 },
  SUBMIT_VERIFICATION: { limit: 5, windowMs: 60_000 },
} as const;

// Longer than the password-reset token's 1h window (auth/constants.ts) — a
// company inbox is checked less reflexively than a personal one.
export const VERIFICATION_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;

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

// Human-readable status wording for the talent-facing status-changed
// notification — no existing formatter to reuse (frontend has its own
// display-label mapping, but this notification's body is baked in at
// creation time on the backend).
export const APPLICATION_STATUS_LABELS: Record<ApplicationStatus, string> = {
  PENDING: "Pending",
  REVIEWING: "In review",
  SHORTLISTED: "Shortlisted",
  INTERVIEW: "Interview",
  OFFERED: "Offer extended",
  REJECTED: "Rejected",
  WITHDRAWN: "Withdrawn",
};
