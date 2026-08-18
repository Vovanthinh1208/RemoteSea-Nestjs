import type { ApplicationStatus } from "@prisma/client";
import { APPLICATION_STATUS_VALUES } from "@/common/constants/enum-values.constants";
import type { BackloggedApplication } from "./interfaces";

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

export type BacklogDigestGroup = {
  employerId: string;
  email: string;
  applicationIds: string[];
  items: { candidateName: string; jobTitle: string; daysStuck: number }[];
};

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Pure grouping step between ApplicationsRepository.findBacklogged's flat
 * row list and one digest email per employer — separated out so the
 * grouping/day-math is unit-testable without a database.
 */
export const groupBackloggedByEmployer = (
  applications: BackloggedApplication[],
  now: Date,
): BacklogDigestGroup[] => {
  const groups = new Map<string, BacklogDigestGroup>();

  for (const app of applications) {
    const employer = app.job.employer;
    let group = groups.get(employer.id);
    if (!group) {
      group = {
        employerId: employer.id,
        email: employer.user.email,
        applicationIds: [],
        items: [],
      };
      groups.set(employer.id, group);
    }
    group.applicationIds.push(app.id);
    group.items.push({
      candidateName: app.talent.user.name ?? "A candidate",
      jobTitle: app.job.title,
      daysStuck: Math.floor(
        (now.getTime() - app.appliedAt.getTime()) / MS_PER_DAY,
      ),
    });
  }

  return Array.from(groups.values());
};
