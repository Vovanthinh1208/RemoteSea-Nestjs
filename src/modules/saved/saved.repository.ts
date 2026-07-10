import { Injectable } from "@nestjs/common";
import type { SavedJob } from "@prisma/client";
import { PrismaService } from "@/core/database/prisma.service";
import type { SavedJobWithJob } from "./interfaces";
import {
  jobWithRelationsInclude,
  omitInternalJobFields,
  type JobWithRelations,
} from "@/common/types/job-with-relations.type";

@Injectable()
export class SavedRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findAllForUser(userId: string): Promise<SavedJobWithJob[]> {
    const rows = (await this.prisma.savedJob.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      include: { job: { include: jobWithRelationsInclude } },
    })) as (SavedJob & { job: JobWithRelations })[];

    return rows.map((row) => ({ ...row, job: omitInternalJobFields(row.job) }));
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
