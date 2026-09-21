import { Injectable } from "@nestjs/common";
import { PrismaService } from "@/core/database/prisma.service";
import {
  jobModerationFlagSelect,
  type CreateJobModerationFlagInput,
  type JobModerationFlag,
  type JobModerationSource,
} from "./interfaces";

@Injectable()
export class JobModerationRepository {
  constructor(private readonly prisma: PrismaService) {}

  findByJobId(jobId: string): Promise<JobModerationFlag | null> {
    return this.prisma.jobModerationFlag.findUnique({
      where: { jobId },
      select: jobModerationFlagSelect,
    });
  }

  findSourceForJob(jobId: string): Promise<JobModerationSource> {
    return this.prisma.job.findUnique({
      where: { id: jobId },
      select: {
        title: true,
        description: true,
        requirements: true,
        salaryMin: true,
        salaryMax: true,
        currency: true,
        country: true,
        isRemote: true,
        employer: { select: { companyName: true } },
      },
    });
  }

  // Upsert, not create — a concurrent second request for the same
  // still-uncached job (two admins opening the same queue row at once)
  // would otherwise hit the jobId unique constraint. Whichever write loses
  // just returns the winner's row instead of a 500 — same reasoning as
  // CvAnalysisRepository.create.
  create(input: CreateJobModerationFlagInput): Promise<JobModerationFlag> {
    return this.prisma.jobModerationFlag.upsert({
      where: { jobId: input.jobId },
      create: input,
      update: {},
      select: jobModerationFlagSelect,
    });
  }

  // A real overwrite (unlike create's intentionally-inert `update: {}`) —
  // backs JobModerationService.regenerate, the explicit "run this again"
  // action an admin can take on a flag that already exists (the posting was
  // edited and resubmitted, or they just want a second opinion). Same
  // reasoning as CvAnalysisRepository.replace.
  replace(input: CreateJobModerationFlagInput): Promise<JobModerationFlag> {
    const { jobId, ...data } = input;
    return this.prisma.jobModerationFlag.upsert({
      where: { jobId },
      create: input,
      update: data,
      select: jobModerationFlagSelect,
    });
  }
}
