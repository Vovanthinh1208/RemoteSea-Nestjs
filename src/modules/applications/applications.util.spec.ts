import { buildApplicationStatusCounts } from "./applications.util";

describe("buildApplicationStatusCounts", () => {
  it("defaults every status to 0 when there are no applications", () => {
    const result = buildApplicationStatusCounts([]);
    expect(result.total).toBe(0);
    expect(result.byStatus).toEqual({
      PENDING: 0,
      REVIEWING: 0,
      SHORTLISTED: 0,
      INTERVIEW: 0,
      OFFERED: 0,
      REJECTED: 0,
      WITHDRAWN: 0,
    });
  });

  it("fills in counts for the statuses present and leaves the rest at 0", () => {
    const result = buildApplicationStatusCounts([
      { status: "PENDING", count: 3 },
      { status: "OFFERED", count: 2 },
    ]);
    expect(result.total).toBe(5);
    expect(result.byStatus.PENDING).toBe(3);
    expect(result.byStatus.OFFERED).toBe(2);
    expect(result.byStatus.REJECTED).toBe(0);
  });
});
