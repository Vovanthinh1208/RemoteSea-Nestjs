export const STRIPE_CLIENT = "STRIPE_CLIENT";

export const RATE_LIMITS = {
  CHECKOUT: { limit: 10, windowMs: 60_000 },
} as const;

// A job that's still PENDING_REVIEW this long after planPaid flipped true is
// stuck, not just "waiting its turn" — the normal synchronous webhook path
// (markJobPaidAndSubmitted -> conditional approveForReview -> email) never
// takes anywhere near this long. See BillingService.reconcileStuckJobs.
export const STUCK_JOB_GRACE_MS = 10 * 60 * 1000;
