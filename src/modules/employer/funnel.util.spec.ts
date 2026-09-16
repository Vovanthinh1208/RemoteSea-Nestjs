import { buildHiringFunnel } from "./funnel.util";

describe("buildHiringFunnel", () => {
  it("orders stages Applied -> Hired with counts from the raw rows", () => {
    const { stages } = buildHiringFunnel([
      { status: "PENDING", count: 100 },
      { status: "REVIEWING", count: 60 },
      { status: "SHORTLISTED", count: 30 },
      { status: "INTERVIEW", count: 20 },
      { status: "OFFERED", count: 10 },
      { status: "OFFER_ACCEPTED", count: 6 },
    ]);

    expect(stages.map((s) => s.status)).toEqual([
      "PENDING",
      "REVIEWING",
      "SHORTLISTED",
      "INTERVIEW",
      "OFFERED",
      "OFFER_ACCEPTED",
    ]);
    expect(stages.map((s) => s.count)).toEqual([100, 60, 30, 20, 10, 6]);
  });

  it("computes conversionFromFirst relative to the PENDING stage", () => {
    const { stages } = buildHiringFunnel([
      { status: "PENDING", count: 100 },
      { status: "OFFER_ACCEPTED", count: 25 },
    ]);

    const hired = stages.find((s) => s.status === "OFFER_ACCEPTED")!;
    expect(hired.conversionFromFirst).toBe(25);
  });

  it("computes conversionFromPrevious relative to the immediately preceding stage", () => {
    const { stages } = buildHiringFunnel([
      { status: "PENDING", count: 100 },
      { status: "REVIEWING", count: 50 },
      { status: "SHORTLISTED", count: 25 },
    ]);

    expect(
      stages.find((s) => s.status === "REVIEWING")!.conversionFromPrevious,
    ).toBe(50);
    expect(
      stages.find((s) => s.status === "SHORTLISTED")!.conversionFromPrevious,
    ).toBe(50);
  });

  it("the first stage always converts 100% from previous (there is no previous)", () => {
    const { stages } = buildHiringFunnel([{ status: "PENDING", count: 42 }]);
    expect(stages[0]!.conversionFromPrevious).toBe(100);
  });

  it("treats a status with no events as count 0, not a missing/undefined entry", () => {
    const { stages } = buildHiringFunnel([{ status: "PENDING", count: 10 }]);
    expect(stages.map((s) => s.count)).toEqual([10, 0, 0, 0, 0, 0]);
  });

  it("never divides by zero — an all-empty funnel is all 0%, not NaN/Infinity", () => {
    const { stages } = buildHiringFunnel([]);
    for (const stage of stages) {
      expect(Number.isFinite(stage.conversionFromFirst)).toBe(true);
      expect(Number.isFinite(stage.conversionFromPrevious)).toBe(true);
    }
    expect(stages[1]!.conversionFromFirst).toBe(0);
  });

  it("separates REJECTED/WITHDRAWN/OFFER_DECLINED into dropOff, not the main stages", () => {
    const { stages, dropOff } = buildHiringFunnel([
      { status: "PENDING", count: 100 },
      { status: "REJECTED", count: 40 },
      { status: "WITHDRAWN", count: 5 },
      { status: "OFFER_DECLINED", count: 2 },
    ]);

    expect(stages.some((s) => s.status === "REJECTED")).toBe(false);
    expect(dropOff).toEqual([
      { status: "REJECTED", label: "Rejected", count: 40 },
      { status: "WITHDRAWN", label: "Withdrawn", count: 5 },
      { status: "OFFER_DECLINED", label: "Offer declined", count: 2 },
    ]);
  });

  it("does not double-count an application that moved backward through a stage twice", () => {
    // EmployerRepository.getApplicationFunnelCounts already collapses this
    // via COUNT(DISTINCT applicationId) — this test documents that
    // buildHiringFunnel just trusts whatever count it's given per status,
    // it doesn't re-derive distinctness itself.
    const { stages } = buildHiringFunnel([
      { status: "PENDING", count: 1 },
      { status: "REVIEWING", count: 1 },
    ]);
    expect(stages.find((s) => s.status === "REVIEWING")!.count).toBe(1);
  });
});
