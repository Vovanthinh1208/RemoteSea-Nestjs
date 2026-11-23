import { Injectable } from "@nestjs/common";
import type { Prisma, SavedJob } from "@prisma/client";
import { PrismaService } from "@/core/database/prisma.service";
import type { SavedJobWithJob } from "./interfaces";
import { jobListItemSelect } from "@/common/types/job-list-item.type";
import { MEMBERSHIP_SET_CAP } from "@/common/constants/membership-set.constants";
import { NotFoundApiException } from "@/common/exceptions/api.exception";
import { ErrorCode } from "@/common/exceptions/error-codes";

// Bookmarks cannot grant access to unpublished company information. Keep
// historical closed/expired listings, but hide drafts and withdrawn content.
const readableJob: Prisma.JobWhereInput = {
  status: { notIn: ["DRAFT", "PENDING_REVIEW", "REJECTED"] },
  employer: { suspendedAt: null, user: { isPaused: false, bannedAt: null } },
};

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
    const where: Prisma.SavedJobWhereInput = { userId, job: readableJob };
    const [savedJobs, total] = await Promise.all([
      this.prisma.savedJob.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take,
        include: { job: { select: jobListItemSelect } },
      }),
      this.prisma.savedJob.count({ where }),
    ]);
    return [savedJobs, total];
  }

  /** Membership set for client-side "is this job saved?" checks — no job join,
   * just ids (see MEMBERSHIP_SET_CAP for why the cap isn't page-sized). */
  async findJobIdsForUser(userId: string): Promise<string[]> {
    const rows = await this.prisma.savedJob.findMany({
      where: { userId, job: readableJob },
      select: { jobId: true },
      take: MEMBERSHIP_SET_CAP,
    });
    return rows.map((row) => row.jobId);
  }

  /** Idempotent: succeeds whether or not the row existed. */
  async delete(userId: string, jobId: string): Promise<void> {
    await this.prisma.savedJob.deleteMany({ where: { userId, jobId } });
  }

  /** Idempotent: upsert rather than create, so calling this twice never conflicts. */
  save(userId: string, jobId: string): Promise<SavedJob> {
    return this.prisma.$transaction(async (tx) => {
      // Serialize with an employer changing visibility before the insert.
      await tx.$queryRaw`SELECT id FROM jobs WHERE id = ${jobId} FOR SHARE`;
      const job = await tx.job.findFirst({
        where: { id: jobId, ...readableJob },
        select: { id: true },
      });
      if (!job) {
        throw new NotFoundApiException(
          "Job not found",
          ErrorCode.JOB_NOT_FOUND,
        );
      }
      return tx.savedJob.upsert({
        where: { userId_jobId: { userId, jobId } },
        create: { userId, jobId },
        update: {},
      });
    });
  }
}
