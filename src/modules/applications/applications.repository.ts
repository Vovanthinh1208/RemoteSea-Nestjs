import { Injectable } from "@nestjs/common";
import type {
  Application,
  ApplicationStatus,
  TalentProfile,
} from "@prisma/client";
import { PrismaService } from "@/core/database/prisma.service";
import type { ApplicationWithJob, CreateApplicationInput } from "./interfaces";
import { jobListItemSelect } from "@/common/types/job-list-item.type";
import {
  jobWithEmployerEmailInclude,
  type JobWithEmployerEmail,
} from "@/common/types/job-with-employer-email.type";

@Injectable()
export class ApplicationsRepository {
  constructor(private readonly prisma: PrismaService) {}

  findTalentIdByUserId(
    userId: string,
  ): Promise<Pick<TalentProfile, "id"> | null> {
    return this.prisma.talentProfile.findUnique({
      where: { userId },
      select: { id: true },
    });
  }

  findTalentWithUserName(
    userId: string,
  ): Promise<(TalentProfile & { user: { name: string | null } }) | null> {
    return this.prisma.talentProfile.findUnique({
      where: { userId },
      include: { user: { select: { name: true } } },
    });
  }

  async findByTalentId(
    talentId: string,
    skip: number,
    take: number,
  ): Promise<[ApplicationWithJob[], number]> {
    // The embedded job only feeds the dashboard's application rows (title,
    // country, company name) — the shared narrow job-card select, not every Job
    // column; previously the full row (description/requirements/responsibilities
    // included) was fetched and serialized per application.
    const [applications, total] = await Promise.all([
      this.prisma.application.findMany({
        where: { talentId },
        orderBy: { appliedAt: "desc" },
        skip,
        take,
        include: { job: { select: jobListItemSelect } },
      }),
      this.prisma.application.count({ where: { talentId } }),
    ]);
    return [applications, total];
  }

  /** DB-side status breakdown for dashboard stats — avoids shipping every row to the
   * client just to count them (see TalentDashboard's application-status tiles). */
  getStatusCountsByTalentId(
    talentId: string,
  ): Promise<Array<{ status: ApplicationStatus; count: number }>> {
    return this.prisma.application
      .groupBy({ by: ["status"], where: { talentId }, _count: true })
      .then((rows) =>
        rows.map((row) => ({ status: row.status, count: row._count })),
      );
  }

  findByJobAndTalent(
    jobId: string,
    talentId: string,
  ): Promise<Application | null> {
    return this.prisma.application.findUnique({
      where: { jobId_talentId: { jobId, talentId } },
    });
  }

  async createAndIncrementApplyCount(
    input: CreateApplicationInput,
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
