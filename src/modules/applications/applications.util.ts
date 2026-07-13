import type { ApplicationStatus } from "@prisma/client";
import { APPLICATION_STATUS_VALUES } from "@/common/constants/enum-values.constants";

export type ApplicationStatusCounts = {
  total: number;
  byStatus: Record<ApplicationStatus, number>;
};

/**
 * Shapes a Prisma groupBy result into a total + per-status breakdown, with every
 * status defaulted to 0 (not just the ones that happen to have rows) — mirrors
 * admin/revenue.util.ts's buildRevenuePlanMix for the same "every enum key present"
 * reason: callers index by status key directly instead of guarding for undefined.
 */
export const buildApplicationStatusCounts = (
  rows: Array<{ status: ApplicationStatus; count: number }>,
): ApplicationStatusCounts => {
  const countByStatus = new Map(
    rows.map(({ status, count }) => [status, count]),
  );
  const byStatus = Object.fromEntries(
    APPLICATION_STATUS_VALUES.map((status) => [
      status,
      countByStatus.get(status) ?? 0,
    ]),
  ) as Record<ApplicationStatus, number>;

  const total = rows.reduce((sum, row) => sum + row.count, 0);
  return { total, byStatus };
};
