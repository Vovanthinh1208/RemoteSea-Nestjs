import { Injectable } from "@nestjs/common";
import type { Application, TalentProfile } from "@prisma/client";
import { PrismaService } from "@/core/database/prisma.service";
import type { ApplicationWithJob, CreateApplicationInput } from "./interfaces";
import { jobWithRelationsInclude } from "@/common/types/job-with-relations.type";
import {
  jobWithEmployerEmailInclude,
  type JobWithEmployerEmail,
} from "@/common/types/job-with-employer-email.type";

@Injectable()
export class ApplicationsRepository {
  constructor(private readonly prisma: PrismaService) {}

  findTalentIdByUserId(userId: string): Promise<Pick<TalentProfile, "id"> | null> {
    return this.prisma.talentProfile.findUnique({
      where: { userId },
      select: { id: true },
    });
  }

  findTalentWithUserName(
    userId: string
  ): Promise<(TalentProfile & { user: { name: string | null } }) | null> {
    return this.prisma.talentProfile.findUnique({
      where: { userId },
      include: { user: { select: { name: true } } },
    });
  }

  findByTalentId(talentId: string): Promise<ApplicationWithJob[]> {
    return this.prisma.application.findMany({
      where: { talentId },
      orderBy: { appliedAt: "desc" },
      include: { job: { include: jobWithRelationsInclude } },
    }) as Promise<ApplicationWithJob[]>;
  }

  findByJobAndTalent(jobId: string, talentId: string): Promise<Application | null> {
    return this.prisma.application.findUnique({
      where: { jobId_talentId: { jobId, talentId } },
    });
  }

  async createAndIncrementApplyCount(
    input: CreateApplicationInput
  ): Promise<{ application: Application; job: JobWithEmployerEmail }> {
    const [application, job] = await this.prisma.$transaction([
      this.prisma.application.create({
        data: {
          jobId: input.jobId,
          talentId: input.talentId,
          coverLetter: input.coverLetter,
          resumeUrl: input.resumeUrl,
        },
      }),
      this.prisma.job.update({
        where: { id: input.jobId },
        data: { applyCount: { increment: 1 } },
        include: jobWithEmployerEmailInclude,
      }),
    ]);
    return { application, job };
  }
}
