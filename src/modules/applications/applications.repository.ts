import { Injectable } from "@nestjs/common";
import type { Application, TalentProfile } from "@prisma/client";
import { PrismaService } from "@/core/database/prisma.service";
import type { ApplicationWithJob, CreateApplicationInput, JobWithEmployerEmail } from "./interfaces";

const JOB_INCLUDE = {
  employer: { select: { companyName: true, logoUrl: true, slug: true } },
  categories: { include: { category: true } },
  skills: { include: { skill: true } },
} as const;

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
      include: { job: { include: JOB_INCLUDE } },
    }) as Promise<ApplicationWithJob[]>;
  }

  findByJobAndTalent(jobId: string, talentId: string): Promise<Application | null> {
    return this.prisma.application.findUnique({
      where: { jobId_talentId: { jobId, talentId } },
    });
  }

  create(input: CreateApplicationInput): Promise<Application> {
    return this.prisma.application.create({
      data: {
        jobId: input.jobId,
        talentId: input.talentId,
        coverLetter: input.coverLetter,
        resumeUrl: input.resumeUrl,
      },
    });
  }

  incrementApplyCountAndGetEmployerEmail(jobId: string): Promise<JobWithEmployerEmail> {
    return this.prisma.job.update({
      where: { id: jobId },
      data: { applyCount: { increment: 1 } },
      include: { employer: { include: { user: { select: { email: true } } } } },
    });
  }
}
