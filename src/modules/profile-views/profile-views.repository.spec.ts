import { ProfileViewsRepository } from "./profile-views.repository";
import type { PrismaService } from "@/core/database/prisma.service";

// The only repository spec in this codebase (see reviews.service.spec.ts's
// convention of mocking the repository, not testing it) — justified here
// because the actual duplicate-view dedup mechanism (a composite upsert key
// truncated to the UTC calendar day) lives entirely in this file and
// nowhere else; there's no service-level branch to observe it through, the
// way Reviews' P2002-conversion made its own DB unique constraint visible
// at the service level.
const makeRepository = () => {
  const prisma = {
    profileView: {
      upsert: jest.fn().mockResolvedValue({ id: "view-1" }),
      count: jest.fn().mockResolvedValue(0),
      groupBy: jest.fn().mockResolvedValue([]),
      findMany: jest.fn().mockResolvedValue([]),
    },
  };
  return {
    repository: new ProfileViewsRepository(prisma as unknown as PrismaService),
    prisma,
  };
};

describe("ProfileViewsRepository.recordView", () => {
  it("upserts on the (viewerId, talentId, viewDate) composite key", async () => {
    const { repository, prisma } = makeRepository();

    await repository.recordView("employer-1", "talent-1");

    expect(prisma.profileView.upsert).toHaveBeenCalledTimes(1);
    const call = prisma.profileView.upsert.mock.calls[0][0];
    expect(call.where).toHaveProperty("viewerId_talentId_viewDate");
    expect(call.where.viewerId_talentId_viewDate).toMatchObject({
      viewerId: "employer-1",
      talentId: "talent-1",
    });
    expect(call.create).toMatchObject({
      viewerId: "employer-1",
      talentId: "talent-1",
    });
    // Nothing to change on a repeat hit — the upsert existing is the dedup.
    expect(call.update).toEqual({});
  });

  it("dedupes two views from the same employer on the same UTC day onto the same key", async () => {
    jest.useFakeTimers().setSystemTime(new Date("2026-08-19T02:00:00.000Z"));
    const { repository, prisma } = makeRepository();
    await repository.recordView("employer-1", "talent-1");

    jest.setSystemTime(new Date("2026-08-19T23:00:00.000Z"));
    await repository.recordView("employer-1", "talent-1");

    const [firstCall, secondCall] = prisma.profileView.upsert.mock.calls;
    expect(firstCall[0].where.viewerId_talentId_viewDate.viewDate).toEqual(
      secondCall[0].where.viewerId_talentId_viewDate.viewDate,
    );
    jest.useRealTimers();
  });

  it("uses a different key for a view the next UTC day", async () => {
    jest.useFakeTimers().setSystemTime(new Date("2026-08-19T23:00:00.000Z"));
    const { repository, prisma } = makeRepository();
    await repository.recordView("employer-1", "talent-1");

    jest.setSystemTime(new Date("2026-08-20T01:00:00.000Z"));
    await repository.recordView("employer-1", "talent-1");

    const [firstCall, secondCall] = prisma.profileView.upsert.mock.calls;
    expect(firstCall[0].where.viewerId_talentId_viewDate.viewDate).not.toEqual(
      secondCall[0].where.viewerId_talentId_viewDate.viewDate,
    );
    jest.useRealTimers();
  });
});

describe("ProfileViewsRepository.getAnalytics", () => {
  const DAY = 24 * 60 * 60 * 1000;
  const todayUtc = () => {
    const n = new Date();
    return new Date(
      Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate()),
    );
  };

  it("computes totalViews from count() and uniqueViewers from groupBy(viewerId).length", async () => {
    const { repository, prisma } = makeRepository();
    prisma.profileView.count.mockResolvedValue(128);
    prisma.profileView.groupBy.mockImplementation(({ by }) =>
      Promise.resolve(
        by[0] === "viewerId"
          ? Array.from({ length: 47 }, (_, i) => ({
              viewerId: `employer-${i}`,
            }))
          : [],
      ),
    );

    const result = await repository.getAnalytics("talent-1");

    expect(prisma.profileView.count).toHaveBeenCalledWith({
      where: { talentId: "talent-1" },
    });
    expect(prisma.profileView.groupBy).toHaveBeenCalledWith({
      by: ["viewerId"],
      where: { talentId: "talent-1" },
    });
    expect(result).toMatchObject({ totalViews: 128, uniqueViewers: 47 });
  });

  // PB27 AC2 + PB26 chart: per-period totals and a zero-filled 30-day series.
  it("breaks views down by today / last 7 days / last 30 days and fills a 30-day daily series", async () => {
    const { repository, prisma } = makeRepository();
    const today = todayUtc();
    prisma.profileView.groupBy.mockImplementation(({ by }) =>
      Promise.resolve(
        by[0] === "viewDate"
          ? [
              { viewDate: today, _count: { _all: 3 } },
              {
                viewDate: new Date(today.getTime() - 3 * DAY),
                _count: { _all: 2 },
              },
              {
                viewDate: new Date(today.getTime() - 20 * DAY),
                _count: { _all: 5 },
              },
            ]
          : [],
      ),
    );

    const result = await repository.getAnalytics("talent-1");

    expect(result.viewsToday).toBe(3);
    expect(result.viewsThisWeek).toBe(5);
    expect(result.viewsThisMonth).toBe(10);
    expect(result.daily).toHaveLength(30);
    expect(result.daily.at(-1)).toEqual({
      date: today.toISOString().slice(0, 10),
      views: 3,
    });
    expect(result.daily.reduce((sum, d) => sum + d.views, 0)).toBe(10);
  });

  // PB27 AC3: who viewed, as the company they view on behalf of.
  it("lists recent viewers with their company and view time", async () => {
    const { repository, prisma } = makeRepository();
    const viewedAt = new Date("2026-10-20T08:00:00Z");
    prisma.profileView.findMany.mockResolvedValue([
      {
        createdAt: viewedAt,
        viewer: {
          companyMembership: {
            employer: { companyName: "Acme", slug: "acme", logoUrl: null },
          },
        },
      },
      { createdAt: viewedAt, viewer: { companyMembership: null } },
    ]);

    const result = await repository.getAnalytics("talent-1");

    expect(result.recentViewers).toEqual([
      { company: { name: "Acme", slug: "acme", logoUrl: null }, viewedAt },
      { company: null, viewedAt },
    ]);
  });
});
