const MS_PER_DAY = 86_400_000;

export type HireTimingApplication = { appliedAt: Date; updatedAt: Date };

/** Average days from application to offer, rounded to 1 decimal place. 0 for an empty list. */
export const computeAvgTimeToHireInDays = (
  offered: HireTimingApplication[],
): number => {
  if (offered.length === 0) return 0;

  const totalDays = offered.reduce(
    (sum, a) => sum + (a.updatedAt.getTime() - a.appliedAt.getTime()) / MS_PER_DAY,
    0,
  );
  return Math.round((totalDays / offered.length) * 10) / 10;
};
