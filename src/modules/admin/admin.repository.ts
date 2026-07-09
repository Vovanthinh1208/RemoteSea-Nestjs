import { Injectable } from "@nestjs/common";
import type { EmployerProfile, Job, JobStatus, PlanType } from "@prisma/client";
import { PrismaService } from "@/core/database/prisma.service";
import { jobWithEmployerEmailInclude } from "@/common/types/job-with-employer-email.type";

type EmployerListItem = EmployerProfile & {
  user: { email: string };
  _count: { jobs: number };
  jobs: { planType: PlanType }[];
};

type JobListItem = Omit<Job, "stripeSessionId" | "reviewNote"> & {
  employer: { companyName: string; isVerified: boolean; slug: string };
  categories: { category: unknown }[];
};

export type PaidJobRevenueRow = Pick<
  Job,
  "id" | "title" | "planType" | "paidAt" | "createdAt"
> & {
  employer: { companyName: string };
};

@Injectable()
export class AdminRepository {
  constructor(private readonly prisma: PrismaService) {}

  findEmployers(
    where: { isVerified?: boolean },
    skip: number,
    take: number,
  ): Promise<[EmployerListItem[], number]> {
    return Promise.all([
      this.prisma.employerProfile.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: "desc" },
        include: {
          user: { select: { email: true } },
          _count: { select: { jobs: true } },
          jobs: { where: { planPaid: true }, select: { planType: true } },
        },
      }),
      this.prisma.employerProfile.count({ where }),
    ]);
  }

  findEmployerById(id: string): Promise<Pick<EmployerProfile, "id"> | null> {
    return this.prisma.employerProfile.findUnique({
      where: { id },
      select: { id: true },
    });
  }

  verifyEmployer(id: string): Promise<EmployerProfile> {
    return this.prisma.employerProfile.update({
      where: { id },
      data: { isVerified: true },
    });
  }

  async suspendEmployer(id: string): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.employerProfile.update({
        where: { id },
        data: { isVerified: false },
      }),
      this.prisma.job.updateMany({
        where: { employerId: id, status: "ACTIVE" },
        data: { status: "CLOSED" },
      }),
    ]);
  }

  async findJobs(
    where: { status: JobStatus },
    skip: number,
    take: number,
  ): Promise<[JobListItem[], number]> {
    const [jobs, total] = await Promise.all([
      this.prisma.job.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: "asc" },
        include: {
          employer: {
            select: { companyName: true, isVerified: true, slug: true },
          },
          categories: { include: { category: true } },
        },
      }),
      this.prisma.job.count({ where }),
    ]);

    // stripeSessionId/reviewNote are internal — strip before this reaches a response.
    const publicJobs = jobs.map(
      ({
        stripeSessionId: _stripeSessionId,
        reviewNote: _reviewNote,
        ...rest
      }) => rest,
    );
    return [publicJobs, total];
  }

  findJobWithEmployerEmail(id: string) {
    return this.prisma.job.findUnique({
      where: { id },
      include: jobWithEmployerEmailInclude,
    });
  }

  approveJob(id: string): Promise<Pick<Job, "status" | "publishedAt">> {
    return this.prisma.job.update({
      where: { id },
      data: { status: "ACTIVE", publishedAt: new Date(), reviewNote: null },
      select: { status: true, publishedAt: true },
    });
  }

  rejectJob(
    id: string,
    note: string | null,
  ): Promise<Pick<Job, "status" | "publishedAt">> {
    return this.prisma.job.update({
      where: { id },
      data: { status: "REJECTED", reviewNote: note },
      select: { status: true, publishedAt: true },
    });
  }

  async countPaidJobsByPlan(): Promise<
    Array<{ planType: PlanType; count: number }>
  > {
    const rows = await this.prisma.job.groupBy({
      by: ["planType"],
      where: { planPaid: true },
      _count: true,
    });
    return rows.map((row) => ({ planType: row.planType, count: row._count }));
  }

  findPaidJobsSince(
    since: Date,
  ): Promise<Array<Pick<Job, "planType" | "paidAt" | "createdAt">>> {
    return this.prisma.job.findMany({
      where: {
        planPaid: true,
        OR: [
          { paidAt: { gte: since } },
          { paidAt: null, createdAt: { gte: since } },
        ],
      },
      select: { planType: true, paidAt: true, createdAt: true },
    });
  }

  findRecentPaidJobs(limit: number): Promise<PaidJobRevenueRow[]> {
    return this.prisma.job.findMany({
      where: { planPaid: true },
      select: {
        id: true,
        title: true,
        planType: true,
        paidAt: true,
        createdAt: true,
        employer: { select: { companyName: true } },
      },
      orderBy: [{ paidAt: "desc" }, { createdAt: "desc" }],
      take: limit,
    });
  }
}
