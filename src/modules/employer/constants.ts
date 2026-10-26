import type { ApplicationStatus } from "@prisma/client";

export const RATE_LIMITS = {
  CREATE_PROFILE: { limit: 5, windowMs: 60_000 },
  UPDATE_PROFILE: { limit: 20, windowMs: 60_000 },
  UPDATE_APPLICATION: { limit: 30, windowMs: 60_000 },
  SUBMIT_VERIFICATION: { limit: 5, windowMs: 60_000 },
  VERIFY_CODE: { limit: 10, windowMs: 60_000 },
  // Call-count based, like every limit above — a bulk call can carry many
  // items, so 10/min comfortably covers clearing out a backlog in a few
  // clicks while still bounding abuse.
  BULK_UPDATE_APPLICATIONS: { limit: 10, windowMs: 60_000 },
  // Heavier than a normal read (up to APPLICANTS_CSV_EXPORT_CAP rows with
  // nested talent/skills joins, serialized in-request) — 10/min covers
  // legitimate re-export-after-a-status-change use without leaving this
  // the one unrated endpoint in the controller an abusive caller could
  // hammer for repeated expensive queries.
  EXPORT_APPLICANTS: { limit: 10, windowMs: 60_000 },
} as const;

// Defensive cap on a single bulk request — the current UI (the 8-item
// "Recent applicants" widget) never sends more than 8, but the endpoint is
// built generic enough to outlive that widget.
export const BULK_UPDATE_MAX_ITEMS = 50;

// PB32 AC3–4: a 6-digit OTP sent to the company inbox, valid for 15 minutes.
export const VERIFICATION_OTP_TTL_MS = 15 * 60 * 1000;
export const VERIFICATION_OTP_LENGTH = 6;
// Wrong entries allowed per code before it is burned and a new one is needed
// — together with VERIFY_CODE's rate limit this keeps a 10^6 code space out
// of brute-force reach.
export const VERIFICATION_OTP_MAX_ATTEMPTS = 5;

// OFFER_ACCEPTED/OFFER_DECLINED never appear as a target anywhere in this
// table — they're the talent's own response to an offer (see
// ApplicationsService.respondToOffer), set through a dedicated talent-only
// endpoint, not something an employer PATCH can set directly. Since
// EmployerService.updateApplication checks its requested `status` against
// this table regardless of which status is requested, an employer request
// for either one always falls through to INVALID_STATUS_TRANSITION.
export const ALLOWED_TRANSITIONS: Record<
  ApplicationStatus,
  ApplicationStatus[]
> = {
  PENDING: ["REVIEWING", "REJECTED"],
  REVIEWING: ["SHORTLISTED", "REJECTED"],
  SHORTLISTED: ["INTERVIEW", "REJECTED"],
  INTERVIEW: ["OFFERED", "REJECTED"],
  OFFERED: ["REJECTED"],
  OFFER_ACCEPTED: [],
  OFFER_DECLINED: [],
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
  OFFER_ACCEPTED: "Offer accepted",
  OFFER_DECLINED: "Offer declined",
  REJECTED: "Rejected",
  WITHDRAWN: "Withdrawn",
};
