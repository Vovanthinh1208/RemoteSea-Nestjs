import { Injectable } from "@nestjs/common";
import type { SavedJob } from "@prisma/client";
import { PrismaService } from "@/core/database/prisma.service";
import type { SavedJobWithJob } from "./interfaces";
import { jobWithRelationsInclude } from "@/common/types/job-with-relations.type";

@Injectable()
export class SavedRepository {
  constructor(private readonly prisma: PrismaService) {}

  findAllForUser(userId: string): Promise<SavedJobWithJob[]> {
    return this.prisma.savedJob.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      include: { job: { include: jobWithRelationsInclude } },
    }) as Promise<SavedJobWithJob[]>;
  }

  findOne(userId: string, jobId: string): Promise<SavedJob | null> {
    return this.prisma.savedJob.findUnique({
      where: { userId_jobId: { userId, jobId } },
    });
  }

  delete(userId: string, jobId: string): Promise<SavedJob> {
    return this.prisma.savedJob.delete({
      where: { userId_jobId: { userId, jobId } },
    });
  }

  create(userId: string, jobId: string): Promise<SavedJob> {
    return this.prisma.savedJob.create({
      data: { userId, jobId },
    });
  }
}
