import { Injectable } from "@nestjs/common";
import type { EmployerProfile, Job, JobStatus, PlanType } from "@prisma/client";
import { PrismaService } from "@/core/database/prisma.service";

type EmployerListItem = Pick<
  EmployerProfile,
  "id" | "companyName" | "isVerified"
> & {
  user: { email: string };
  _count: { jobs: number };
  jobs: { planType: PlanType }[];
};

type JobListItem = Omit<
  Job,
  | "stripeSessionId"
  | "reviewNote"
  | "responsibilities"
  | "applicationUrl"
  | "paidAt"
  | "rejectedAt"
> & {
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
        // Narrow select, not include — the admin employer list only ever
        // renders id/companyName/isVerified/jobCount/totalSpend (see
        // EmployerListItemDto in docs/admin.dto.ts); include was pulling
        // every EmployerProfile column, including the description @db.Text
        // field, into every paginated page for no reason.
        select: {
          id: true,
          companyName: true,
          isVerified: true,
          user: { select: { email: true } },
          _count: { select: { jobs: true } },
          jobs: { where: { planPaid: true }, select: { planType: true } },
        },
      }),
      this.prisma.employerProfile.count({ where }),
    ]);
  }

  findEmployerById(
    id: string,
  ): Promise<Pick<
    EmployerProfile,
    "id" | "companyName" | "isVerified"
  > | null> {
    return this.prisma.employerProfile.findUnique({
      where: { id },
      select: { id: true, companyName: true, isVerified: true },
    });
  }

  // Explicit select matching remotesea-web's AdminJob type field-for-field (verified
  // against actual usage in src/features/admin/**) — was a root-level `include`,
  // which pulls every Job scalar (description/requirements/benefits text+array
  // columns included) on every page of up to 50 rows, then stripped 2 fields in JS
  // after the fact. stripeSessionId/reviewNote stay excluded, same as before.
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
        select: {
          id: true,
          employerId: true,
          title: true,
          slug: true,
          description: true,
          requirements: true,
          jobType: true,
          level: true,
          salaryMin: true,
          salaryMax: true,
          currency: true,
          isRemote: true,
          timezone: true,
          country: true,
          status: true,
          planType: true,
          planPaid: true,
          benefits: true,
          vnHireCount: true,
          isFeatured: true,
          viewCount: true,
          applyCount: true,
          publishedAt: true,
          expiresAt: true,
          createdAt: true,
          updatedAt: true,
          employer: {
            select: { companyName: true, isVerified: true, slug: true },
          },
          categories: { include: { category: true } },
        },
      }),
      this.prisma.job.count({ where }),
    ]);

    return [jobs, total];
  }

  // Backs AdminService.reviewJob only — narrow select (that method's own needs),
  // not the shared jobWithEmployerEmailInclude, which pulls the full Job row and
  // is also reused by billing/applications for their own, different purposes.
  findJobWithEmployerEmail(id: string) {
    return this.prisma.job.findUnique({
      where: { id },
      select: {
        id: true,
        title: true,
        slug: true,
        status: true,
        employer: { select: { user: { select: { email: true } } } },
      },
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
