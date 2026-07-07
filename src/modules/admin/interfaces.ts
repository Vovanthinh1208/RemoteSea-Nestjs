import type { PlanType } from "@prisma/client";

export interface RevenueMonthBucket {
  key: string;
  label: string;
  standard: number;
  featured: number;
  handsOn: number;
}

export interface RevenuePlanMix {
  planType: PlanType;
  label: string;
  price: number;
  count: number;
  amount: number;
}

export interface RevenueTransaction {
  jobId: string;
  jobTitle: string;
  companyName: string;
  planType: PlanType;
  amount: number;
  paidAt: string;
}

export interface RevenueSummary {
  months: RevenueMonthBucket[];
  mix: RevenuePlanMix[];
  transactions: RevenueTransaction[];
  totals: { allTime: number; thisMonth: number };
}
