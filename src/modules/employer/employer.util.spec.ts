import { computeAvgTimeToHireInDays } from "./employer.util";

describe("computeAvgTimeToHireInDays", () => {
  it("returns 0 for an empty list", () => {
    expect(computeAvgTimeToHireInDays([])).toBe(0);
  });

  it("computes days between appliedAt and updatedAt for a single offer", () => {
    const appliedAt = new Date("2026-01-01T00:00:00.000Z");
    const updatedAt = new Date("2026-01-06T00:00:00.000Z");
    expect(computeAvgTimeToHireInDays([{ appliedAt, updatedAt }])).toBe(5);
  });

  it("averages across multiple offers and rounds to 1 decimal place", () => {
    const base = new Date("2026-01-01T00:00:00.000Z");
    const offers = [
      { appliedAt: base, updatedAt: new Date("2026-01-04T00:00:00.000Z") }, // 3 days
      { appliedAt: base, updatedAt: new Date("2026-01-06T12:00:00.000Z") }, // 5.5 days
    ];
    expect(computeAvgTimeToHireInDays(offers)).toBe(4.3);
  });
});
