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
