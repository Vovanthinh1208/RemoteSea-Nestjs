import { Injectable } from "@nestjs/common";
import { PrismaService } from "@/core/database/prisma.service";
import type { ProfileViewAnalytics } from "./interfaces";

const DAY_MS = 24 * 60 * 60 * 1000;
const DAILY_WINDOW_DAYS = 30;
const RECENT_VIEWERS_LIMIT = 20;

const startOfUtcDay = (): Date => {
  const now = new Date();
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
};

const daysAgo = (today: Date, days: number): Date =>
  new Date(today.getTime() - days * DAY_MS);

const isoDay = (date: Date): string => date.toISOString().slice(0, 10);

@Injectable()
export class ProfileViewsRepository {
  constructor(private readonly prisma: PrismaService) {}

  // Upsert on the (viewer, talent, day) unique constraint: the first view
  // from this employer today inserts a row, every later one this same day
  // hits the constraint and no-ops (the update clause has nothing to
  // change) — this *is* the dedup, not a pre-check-then-insert, so it's
  // race-safe under concurrent requests.
  async recordView(viewerId: string, talentId: string): Promise<void> {
    const viewDate = startOfUtcDay();
    await this.prisma.profileView.upsert({
      where: { viewerId_talentId_viewDate: { viewerId, talentId, viewDate } },
      create: { viewerId, talentId, viewDate },
      update: {},
    });
  }

  // DB-side aggregation (COUNT + GROUP BY), not "load every view row and
  // reduce in JS" — same reasoning as ReviewsRepository's aggregate() call.
  // One row is one (employer, talent, UTC day), so every count here is
  // already deduplicated per viewer per day (PB27 RC1).
  async getAnalytics(talentId: string): Promise<ProfileViewAnalytics> {
    const today = startOfUtcDay();
    const weekStart = daysAgo(today, 6);
    const monthStart = daysAgo(today, DAILY_WINDOW_DAYS - 1);

    const [totalViews, viewerGroups, dayGroups, recent] = await Promise.all([
      this.prisma.profileView.count({ where: { talentId } }),
      this.prisma.profileView.groupBy({
        by: ["viewerId"],
        where: { talentId },
      }),
      this.prisma.profileView.groupBy({
        by: ["viewDate"],
        where: { talentId, viewDate: { gte: monthStart } },
        _count: { _all: true },
      }),
      this.prisma.profileView.findMany({
        where: { talentId },
        orderBy: { createdAt: "desc" },
        take: RECENT_VIEWERS_LIMIT,
        select: {
          createdAt: true,
          viewer: {
            select: {
              companyMembership: {
                select: {
                  employer: {
                    select: { companyName: true, slug: true, logoUrl: true },
                  },
                },
              },
            },
          },
        },
      }),
    ]);

    const byDay = new Map(
      dayGroups.map((g) => [isoDay(g.viewDate), g._count._all]),
    );
    const daily = Array.from({ length: DAILY_WINDOW_DAYS }, (_, i) => {
      const date = isoDay(daysAgo(today, DAILY_WINDOW_DAYS - 1 - i));
      return { date, views: byDay.get(date) ?? 0 };
    });
    const sumSince = (from: Date): number =>
      dayGroups
        .filter((g) => g.viewDate >= from)
        .reduce((sum, g) => sum + g._count._all, 0);

    return {
      totalViews,
      uniqueViewers: viewerGroups.length,
      viewsToday: sumSince(today),
      viewsThisWeek: sumSince(weekStart),
      viewsThisMonth: sumSince(monthStart),
      daily,
      recentViewers: recent.map((row) => {
        const employer = row.viewer.companyMembership?.employer;
        return {
          company: employer
            ? {
                name: employer.companyName,
                slug: employer.slug,
                logoUrl: employer.logoUrl,
              }
            : null,
          viewedAt: row.createdAt,
        };
      }),
    };
  }
}
