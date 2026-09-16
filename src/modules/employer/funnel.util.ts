import type { ApplicationStatus } from "@prisma/client";

// The "grows down" pipeline — excludes REJECTED/WITHDRAWN/OFFER_DECLINED,
// which are exits from the pipeline rather than stages within it (see
// dropOffStages below). OFFER_ACCEPTED is the funnel's "hired" endpoint.
const FUNNEL_STAGE_ORDER: ApplicationStatus[] = [
  "PENDING",
  "REVIEWING",
  "SHORTLISTED",
  "INTERVIEW",
  "OFFERED",
  "OFFER_ACCEPTED",
];

const DROP_OFF_STATUSES: ApplicationStatus[] = [
  "REJECTED",
  "WITHDRAWN",
  "OFFER_DECLINED",
];

const STAGE_LABEL: Record<ApplicationStatus, string> = {
  PENDING: "Applied",
  REVIEWING: "Reviewing",
  SHORTLISTED: "Shortlisted",
  INTERVIEW: "Interview",
  OFFERED: "Offered",
  OFFER_ACCEPTED: "Hired",
  OFFER_DECLINED: "Offer declined",
  REJECTED: "Rejected",
  WITHDRAWN: "Withdrawn",
};

export interface FunnelStage {
  status: ApplicationStatus;
  label: string;
  count: number;
  /** % of the first stage's count (0 if the first stage itself is 0). */
  conversionFromFirst: number;
  /** % of the immediately preceding stage's count (100 for the first stage). */
  conversionFromPrevious: number;
}

export interface FunnelDropOff {
  status: ApplicationStatus;
  label: string;
  count: number;
}

const percentOf = (count: number, of: number): number =>
  of === 0 ? 0 : Math.round((count / of) * 1000) / 10;

/** Pure aggregation → chart-ready shape, split from
 * EmployerRepository.getApplicationFunnelCounts's raw SQL so the
 * conversion-rate math (and its 0/0 edge cases) is unit-testable without a
 * database. `counts` need not cover every status — a status with no events
 * yet is simply absent, not a zero-count row. */
export const buildHiringFunnel = (
  counts: Array<{ status: ApplicationStatus; count: number }>,
): { stages: FunnelStage[]; dropOff: FunnelDropOff[] } => {
  const countByStatus = new Map(counts.map((c) => [c.status, c.count]));
  // Non-null: FUNNEL_STAGE_ORDER is a fixed, non-empty literal — index 0 and
  // every index-1 lookup below are always in range.
  const firstCount = countByStatus.get(FUNNEL_STAGE_ORDER[0]!) ?? 0;

  const stages = FUNNEL_STAGE_ORDER.map((status, index) => {
    const count = countByStatus.get(status) ?? 0;
    const previousCount =
      index === 0
        ? count
        : (countByStatus.get(FUNNEL_STAGE_ORDER[index - 1]!) ?? 0);
    return {
      status,
      label: STAGE_LABEL[status],
      count,
      conversionFromFirst: percentOf(count, firstCount),
      conversionFromPrevious:
        index === 0 ? 100 : percentOf(count, previousCount),
    };
  });

  const dropOff = DROP_OFF_STATUSES.map((status) => ({
    status,
    label: STAGE_LABEL[status],
    count: countByStatus.get(status) ?? 0,
  }));

  return { stages, dropOff };
};
