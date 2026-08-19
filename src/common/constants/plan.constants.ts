import type { PlanType } from "@prisma/client";

export const PLAN_PRICES: Record<PlanType, number> = {
  STANDARD: 15000,
  FEATURED: 35000,
  HANDS_ON: 120000,
};

export const PLAN_LABELS: Record<PlanType, string> = {
  STANDARD: "Standard listing",
  FEATURED: "Featured listing",
  HANDS_ON: "Hands-on hiring",
};

// How long a paid listing stays live once it goes ACTIVE (see JobsRepository
// .approveJob, which anchors expiresAt on publishedAt, not paidAt — an
// unapproved job sitting in PENDING_REVIEW for days shouldn't burn down its
// paid-for days before anyone can even see it). Matches the exact wording
// shown to the employer at checkout (remotesea-web's post-job.schemas.ts
// TIERS: "30-day listing" / "60-day listing" / "Unlimited listing").
// null = never expires.
export const PLAN_DURATION_DAYS: Record<PlanType, number | null> = {
  STANDARD: 30,
  FEATURED: 60,
  HANDS_ON: null,
};
