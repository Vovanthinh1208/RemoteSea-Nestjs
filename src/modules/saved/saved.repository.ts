import { Injectable } from "@nestjs/common";
import type { SavedJob } from "@prisma/client";
import { PrismaService } from "@/core/database/prisma.service";
import type { SavedJobWithJob } from "./interfaces";
import { jobListItemSelect } from "@/common/types/job-list-item.type";

@Injectable()
export class SavedRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findAllForUser(
    userId: string,
    skip: number,
    take: number,
  ): Promise<[SavedJobWithJob[], number]> {
    // The embedded job is only ever rendered as a card (same consumer as the
    // /jobs list), so this selects the shared narrow job-card shape instead of
    // every Job column — previously the full row (description/requirements/
    // responsibilities included) was fetched and serialized per saved job.
    const [savedJobs, total] = await Promise.all([
      this.prisma.savedJob.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
        skip,
        take,
        include: { job: { select: jobListItemSelect } },
      }),
      this.prisma.savedJob.count({ where: { userId } }),
    ]);
    return [savedJobs, total];
  }

  /** Membership set for client-side "is this job saved?" checks — no job join, just ids. */
  async findJobIdsForUser(userId: string): Promise<string[]> {
    const rows = await this.prisma.savedJob.findMany({
      where: { userId },
      select: { jobId: true },
    });
    return rows.map((row) => row.jobId);
  }

  /** Idempotent: succeeds whether or not the row existed. */
  async delete(userId: string, jobId: string): Promise<void> {
    await this.prisma.savedJob.deleteMany({ where: { userId, jobId } });
  }

  /** Idempotent: upsert rather than create, so calling this twice never conflicts. */
  save(userId: string, jobId: string): Promise<SavedJob> {
    return this.prisma.savedJob.upsert({
      where: { userId_jobId: { userId, jobId } },
      create: { userId, jobId },
      update: {},
    });
  }
}
