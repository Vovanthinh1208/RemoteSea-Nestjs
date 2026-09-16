import {
  buildApplicationStatusCounts,
  groupBackloggedByEmployer,
} from "./applications.util";
import type { BackloggedApplication } from "./interfaces";

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
      OFFER_ACCEPTED: 0,
      OFFER_DECLINED: 0,
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

const makeBacklogged = (
  overrides: Partial<BackloggedApplication> = {},
): BackloggedApplication =>
  ({
    id: "app-1",
    status: "PENDING",
    appliedAt: new Date("2026-08-01T00:00:00.000Z"),
    talent: { user: { name: "Jane Doe" } },
    job: {
      title: "Backend Engineer",
      employer: {
        id: "employer-1",
        companyName: "Acme",
        user: { email: "acme@example.com" },
      },
    },
    ...overrides,
  }) as BackloggedApplication;

describe("groupBackloggedByEmployer", () => {
  const now = new Date("2026-08-14T00:00:00.000Z");

  it("groups applications from different employers into separate digests", () => {
    const groups = groupBackloggedByEmployer(
      [
        makeBacklogged({ id: "app-1" }),
        makeBacklogged({
          id: "app-2",
          job: {
            title: "Designer",
            employer: {
              id: "employer-2",
              companyName: "Beta",
              user: { email: "beta@example.com" },
            },
          },
        }),
      ],
      now,
    );

    expect(groups).toHaveLength(2);
    expect(groups.map((g) => g.employerId).sort()).toEqual([
      "employer-1",
      "employer-2",
    ]);
  });

  it("collects multiple applications for the same employer into one digest", () => {
    const groups = groupBackloggedByEmployer(
      [
        makeBacklogged({ id: "app-1" }),
        makeBacklogged({ id: "app-2", status: "REVIEWING" }),
      ],
      now,
    );

    expect(groups).toHaveLength(1);
    expect(groups[0]!.applicationIds).toEqual(["app-1", "app-2"]);
    expect(groups[0]!.items).toHaveLength(2);
  });

  it("computes whole days stuck from appliedAt to now", () => {
    const groups = groupBackloggedByEmployer(
      [makeBacklogged({ appliedAt: new Date("2026-08-10T12:00:00.000Z") })],
      now,
    );

    // 2026-08-10T12:00 -> 2026-08-14T00:00 = 3.5 days, floored to 3.
    expect(groups[0]!.items[0]!.daysStuck).toBe(3);
  });

  it("falls back to 'A candidate' when the talent has no name", () => {
    const groups = groupBackloggedByEmployer(
      [makeBacklogged({ talent: { user: { name: null } } })],
      now,
    );

    expect(groups[0]!.items[0]!.candidateName).toBe("A candidate");
  });
});
