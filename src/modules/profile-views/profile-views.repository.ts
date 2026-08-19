import { Injectable } from "@nestjs/common";
import { PrismaService } from "@/core/database/prisma.service";
import type { ProfileViewAnalytics } from "./interfaces";

const startOfUtcDay = (): Date => {
  const now = new Date();
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
};

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
  async getAnalytics(talentId: string): Promise<ProfileViewAnalytics> {
    const [totalViews, viewerGroups] = await Promise.all([
      this.prisma.profileView.count({ where: { talentId } }),
      this.prisma.profileView.groupBy({
        by: ["viewerId"],
        where: { talentId },
      }),
    ]);
    return { totalViews, uniqueViewers: viewerGroups.length };
  }
}
