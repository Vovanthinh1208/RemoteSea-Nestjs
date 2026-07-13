import {
  buildMonthlyRevenueBuckets,
  buildRecentMonthKeys,
  buildRevenuePlanMix,
  buildRevenueTransactions,
  computeRevenueTotals,
  monthKeyOf,
} from "./revenue.util";
import type { PaidJobRevenueRow } from "./admin.repository";

describe("buildMonthlyRevenueBuckets", () => {
  const monthKeys = buildRecentMonthKeys(3, new Date(Date.UTC(2026, 5, 15)));

  it("returns a zeroed bucket per month when there are no paid jobs", () => {
    const months = buildMonthlyRevenueBuckets([], monthKeys);
    expect(months).toHaveLength(3);
    expect(
      months.every(
        (m) => m.standard === 0 && m.featured === 0 && m.handsOn === 0,
      ),
    ).toBe(true);
  });

  it("sums multiple plan types into the correct month bucket", () => {
    const paidOn = new Date(Date.UTC(2026, 5, 10));
    const months = buildMonthlyRevenueBuckets(
      [
        { planType: "STANDARD", paidAt: paidOn, createdAt: paidOn },
        { planType: "STANDARD", paidAt: paidOn, createdAt: paidOn },
        { planType: "FEATURED", paidAt: paidOn, createdAt: paidOn },
      ],
      monthKeys,
    );
    const june = months.find((m) => m.key === monthKeyOf(paidOn));
    expect(june?.standard).toBeGreaterThan(0);
    expect(june?.featured).toBeGreaterThan(0);
  });

  it("ignores a paid job outside the given month-key window", () => {
    const outsideWindow = new Date(Date.UTC(2020, 0, 1));
    const months = buildMonthlyRevenueBuckets(
      [
        {
          planType: "STANDARD",
          paidAt: outsideWindow,
          createdAt: outsideWindow,
        },
      ],
      monthKeys,
    );
    const total = months.reduce(
      (sum, m) => sum + m.standard + m.featured + m.handsOn,
      0,
    );
    expect(total).toBe(0);
  });

  it("falls back to createdAt when paidAt is null", () => {
    const createdOn = new Date(Date.UTC(2026, 5, 10));
    const months = buildMonthlyRevenueBuckets(
      [{ planType: "HANDS_ON", paidAt: null, createdAt: createdOn }],
      monthKeys,
    );
    const june = months.find((m) => m.key === monthKeyOf(createdOn));
    expect(june?.handsOn).toBeGreaterThan(0);
  });
});

describe("buildRevenuePlanMix", () => {
  it("includes every plan type even with zero paid jobs, in a stable order", () => {
    const mix = buildRevenuePlanMix([]);
    expect(mix.map((m) => m.planType)).toEqual([
      "STANDARD",
      "FEATURED",
      "HANDS_ON",
    ]);
    expect(mix.every((m) => m.count === 0 && m.amount === 0)).toBe(true);
  });

  it("computes amount as count * price per plan", () => {
    const mix = buildRevenuePlanMix([{ planType: "FEATURED", count: 3 }]);
    const featured = mix.find((m) => m.planType === "FEATURED");
    expect(featured?.count).toBe(3);
    expect(featured?.amount).toBe(featured!.price * 3);
  });
});

describe("buildRevenueTransactions", () => {
  it("maps each paid job to a transaction with an ISO paidAt", () => {
    const row: PaidJobRevenueRow = {
      id: "job-1",
      title: "Backend Engineer",
      planType: "STANDARD",
      paidAt: new Date(Date.UTC(2026, 5, 10)),
      createdAt: new Date(Date.UTC(2026, 5, 9)),
      employer: { companyName: "Acme" },
    };
    const [transaction] = buildRevenueTransactions([row]);
    expect(transaction).toMatchObject({
      jobId: "job-1",
      jobTitle: "Backend Engineer",
      companyName: "Acme",
      planType: "STANDARD",
    });
    expect(transaction.paidAt).toBe(row.paidAt!.toISOString());
  });
});

describe("computeRevenueTotals", () => {
  it("sums mix amounts for allTime and the given month for thisMonth", () => {
    const mix = buildRevenuePlanMix([
      { planType: "STANDARD", count: 2 },
      { planType: "FEATURED", count: 1 },
    ]);
    const months = [
      { key: "2026-04", label: "Apr", standard: 100, featured: 0, handsOn: 0 },
      { key: "2026-05", label: "May", standard: 50, featured: 20, handsOn: 0 },
    ];
    const totals = computeRevenueTotals(mix, months, 1);
    expect(totals.allTime).toBe(mix.reduce((sum, m) => sum + m.amount, 0));
    expect(totals.thisMonth).toBe(70);
  });
});
