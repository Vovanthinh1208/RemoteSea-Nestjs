import { Injectable } from "@nestjs/common";
import type {
  EmployerProfile,
  Job,
  JobStatus,
  PlanType,
  User,
  UserRole,
} from "@prisma/client";
import { Prisma } from "@prisma/client";
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
  | "rejectedAt"
> & {
  employer: { companyName: string; isVerified: boolean; slug: string };
  categories: { category: unknown }[];
  // null until an admin has actually triggered the AI risk check for this
  // job (JobModerationService.getOrCreate) — see admin.swagger.ts's
  // ApiGetJobModerationFlag for why this isn't computed for every row. Same
  // shape as that endpoint's own response (not a narrower one) so the
  // frontend can merge either source into one cache entry.
  moderationFlag: {
    id: string;
    riskLevel: string;
    reasons: string[];
    summary: string;
    model: string;
    createdAt: Date;
  } | null;
};

export type PaidJobRevenueRow = Pick<
  Job,
  "id" | "title" | "planType" | "paidAt" | "createdAt"
> & {
  employer: { companyName: string };
};

export type AdminUserListItem = Pick<
  User,
  "id" | "email" | "name" | "role" | "bannedAt" | "createdAt"
>;

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
    // The PENDING_REVIEW queue is a moderation queue, and PENDING_REVIEW is
    // only ever reached via payment (BillingRepository.markJobPaidAndSubmitted
    // — see the enum-values audit trail), so paidAt is always set here.
    // createdAt (first drafted) is the wrong signal for "how long has this
    // been waiting on us": a job drafted weeks ago but only paid and
    // submitted today would sort as if it were the oldest thing in the
    // queue, while one paid weeks ago would sort as if brand new. Every
    // other status view keeps createdAt, where paidAt may be null (DRAFT)
    // or just isn't the meaningful ordering (ACTIVE/REJECTED/EXPIRED).
    const orderBy: Prisma.JobOrderByWithRelationInput =
      where.status === "PENDING_REVIEW"
        ? { paidAt: "asc" }
        : { createdAt: "asc" };

    const [jobs, total] = await Promise.all([
      this.prisma.job.findMany({
        where,
        skip,
        take,
        orderBy,
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
          paidAt: true,
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
          // One extra join, not a new round trip — whatever's already been
          // computed for this job (via GET .../moderation-flag) rides along
          // with the list for free; still null for a job no admin has
          // triggered a check on yet.
          moderationFlag: {
            select: {
              id: true,
              riskLevel: true,
              reasons: true,
              summary: true,
              model: true,
              createdAt: true,
            },
          },
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

  findUsers(
    where: Prisma.UserWhereInput,
    skip: number,
    take: number,
  ): Promise<[AdminUserListItem[], number]> {
    return Promise.all([
      this.prisma.user.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          bannedAt: true,
          createdAt: true,
        },
      }),
      this.prisma.user.count({ where }),
    ]);
  }

  findUserById(
    id: string,
  ): Promise<Pick<User, "id" | "role" | "bannedAt" | "email"> | null> {
    return this.prisma.user.findUnique({
      where: { id },
      select: { id: true, role: true, bannedAt: true, email: true },
    });
  }

  updateUserRoleOrBan(
    id: string,
    data: { role?: UserRole; bannedAt?: Date | null },
  ): Promise<User> {
    return this.prisma.user.update({ where: { id }, data });
  }
}
