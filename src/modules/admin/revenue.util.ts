import type { Job, PlanType } from "@prisma/client";
import type { PaidJobRevenueRow } from "./admin.repository";
import type {
  RevenueMonthBucket,
  RevenuePlanMix,
  RevenueTransaction,
} from "./interfaces";
import { PLAN_LABELS, PLAN_PRICES } from "@/common/constants/plan.constants";
import { PLAN_TYPE_VALUES } from "@/common/constants/enum-values.constants";

const MONTH_LABELS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

export interface MonthKey {
  key: string;
  label: string;
}

export const monthKeyOf = (date: Date): string =>
  `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;

export const buildRecentMonthKeys = (count: number, from: Date): MonthKey[] => {
  const keys: MonthKey[] = [];
  for (let i = count - 1; i >= 0; i -= 1) {
    const monthStart = new Date(
      Date.UTC(from.getUTCFullYear(), from.getUTCMonth() - i, 1),
    );
    keys.push({
      key: monthKeyOf(monthStart),
      label: MONTH_LABELS[monthStart.getUTCMonth()],
    });
  }
  return keys;
};

type PaidJobForBucketing = Pick<Job, "planType" | "paidAt" | "createdAt">;

/** Buckets paid jobs into the given months by plan type, summing each plan's price per month. */
export const buildMonthlyRevenueBuckets = (
  paidJobs: PaidJobForBucketing[],
  monthKeys: MonthKey[],
): RevenueMonthBucket[] => {
  const months: RevenueMonthBucket[] = monthKeys.map(({ key, label }) => ({
    key,
    label,
    standard: 0,
    featured: 0,
    handsOn: 0,
  }));
  const monthIndexByKey = new Map(months.map((month, index) => [month.key, index]));

  for (const job of paidJobs) {
    const amount = PLAN_PRICES[job.planType];
    const paidOn = job.paidAt ?? job.createdAt;

    const monthIndex = monthIndexByKey.get(monthKeyOf(paidOn));
    if (monthIndex === undefined) continue;

    const bucket = months[monthIndex];
    if (job.planType === "STANDARD") bucket.standard += amount;
    else if (job.planType === "FEATURED") bucket.featured += amount;
    else bucket.handsOn += amount;
  }

  return months;
};

/** Builds the price/count/amount breakdown per plan type, in PLAN_TYPE_VALUES order. */
export const buildRevenuePlanMix = (
  planCounts: Array<{ planType: PlanType; count: number }>,
): RevenuePlanMix[] => {
  const countByPlan = new Map(planCounts.map(({ planType, count }) => [planType, count]));
  return PLAN_TYPE_VALUES.map((planType) => {
    const count = countByPlan.get(planType) ?? 0;
    return {
      planType,
      label: PLAN_LABELS[planType],
      price: PLAN_PRICES[planType],
      count,
      amount: count * PLAN_PRICES[planType],
    };
  });
};

export const buildRevenueTransactions = (
  paidJobs: PaidJobRevenueRow[],
): RevenueTransaction[] =>
  paidJobs.map((job) => ({
    jobId: job.id,
    jobTitle: job.title,
    companyName: job.employer.companyName,
    planType: job.planType,
    amount: PLAN_PRICES[job.planType],
    paidAt: (job.paidAt ?? job.createdAt).toISOString(),
  }));

export const computeRevenueTotals = (
  mix: RevenuePlanMix[],
  months: RevenueMonthBucket[],
  currentMonthIndex: number,
): { allTime: number; thisMonth: number } => {
  const allTime = mix.reduce((sum, m) => sum + m.amount, 0);
  const currentMonth = months[currentMonthIndex];
  const thisMonth = currentMonth.standard + currentMonth.featured + currentMonth.handsOn;
  return { allTime, thisMonth };
};
