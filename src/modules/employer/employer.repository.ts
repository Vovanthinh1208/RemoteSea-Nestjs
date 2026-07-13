import { Injectable } from "@nestjs/common";
import type {
  Application,
  ApplicationStatus,
  EmployerProfile,
  JobStatus,
  Prisma,
} from "@prisma/client";
import { PrismaService } from "@/core/database/prisma.service";

const EMPLOYER_JOBS_LIST_CAP = 200;

const profileSelect = {
  id: true,
  companyName: true,
  slug: true,
  logoUrl: true,
  websiteUrl: true,
  description: true,
  industry: true,
  size: true,
  founded: true,
  hqCountry: true,
  hqCity: true,
  isVerified: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.EmployerProfileSelect;

export type PublicEmployerProfile = Prisma.EmployerProfileGetPayload<{
  select: typeof profileSelect;
}>;

const profileWithApplicationCountsSelect = {
  ...profileSelect,
  _count: { select: { jobs: true } },
  jobs: { select: { _count: { select: { applications: true } } } },
} satisfies Prisma.EmployerProfileSelect;

export type ProfileWithApplicationCounts = Prisma.EmployerProfileGetPayload<{
  select: typeof profileWithApplicationCountsSelect;
}>;

@Injectable()
export class EmployerRepository {
  constructor(private readonly prisma: PrismaService) {}

  findProfileByUserId(
    userId: string,
  ): Promise<{ id: string; logoUrl: string | null } | null> {
    return this.prisma.employerProfile.findUnique({
      where: { userId },
      select: { id: true, logoUrl: true },
    });
  }

  findProfileBySlug(slug: string): Promise<EmployerProfile | null> {
    return this.prisma.employerProfile.findUnique({ where: { slug } });
  }

  async createProfileForUser(
    userId: string,
    data: {
      companyName: string;
      websiteUrl?: string;
      description?: string;
      industry?: string;
      size?: string;
      hqCountry?: string;
      hqCity?: string;
    },
    slug: string,
  ): Promise<{ id: string; slug: string; companyName: string }> {
    const [, profile] = await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: userId },
        data: { role: "EMPLOYER" },
      }),
      this.prisma.employerProfile.create({
        data: { ...data, userId, slug },
        select: { id: true, slug: true, companyName: true },
      }),
    ]);
    return profile;
  }

  findProfileWithApplicationCounts(
    userId: string,
  ): Promise<ProfileWithApplicationCounts | null> {
    return this.prisma.employerProfile.findUnique({
      where: { userId },
      select: profileWithApplicationCountsSelect,
    });
  }

  updateProfile(
    id: string,
    data: Prisma.EmployerProfileUpdateInput,
  ): Promise<PublicEmployerProfile> {
    return this.prisma.employerProfile.update({
      where: { id },
      data,
      select: profileSelect,
    });
  }

  findJobsByEmployer(employerId: string, status?: JobStatus) {
    return this.prisma.job.findMany({
      where: { employerId, ...(status && { status }) },
      orderBy: { createdAt: "desc" },
      // Scoped to one employer's own jobs (not attacker-scalable across the DB),
      // but unlike every other list endpoint this one has no pagination at all —
      // a hard cap avoids an unbounded query for an employer with a very long
      // posting history, without changing the response shape the frontend expects.
      take: EMPLOYER_JOBS_LIST_CAP,
      select: {
        id: true,
        title: true,
        slug: true,
        status: true,
        planType: true,
        planPaid: true,
        viewCount: true,
        applyCount: true,
        publishedAt: true,
        createdAt: true,
        _count: { select: { applications: true } },
      },
    });
  }

  async getEmployerJobStats(employerId: string): Promise<{
    totalApps: number;
    shortlisted: number;
    offered: Array<{ appliedAt: Date; updatedAt: Date }>;
  }> {
    const [totalApps, shortlisted, offered] = await Promise.all([
      this.prisma.application.count({ where: { job: { employerId } } }),
      this.prisma.application.count({
        where: { job: { employerId }, status: "SHORTLISTED" },
      }),
      this.prisma.application.findMany({
        where: { job: { employerId }, status: "OFFERED" },
        select: { appliedAt: true, updatedAt: true },
      }),
    ]);
    return { totalApps, shortlisted, offered };
  }

  findJobWithEmployerOwner(id: string) {
    return this.prisma.job.findUnique({
      where: { id },
      select: { id: true, employer: { select: { userId: true } } },
    });
  }

  async findApplicationsForJob(
    jobId: string,
    status: ApplicationStatus | undefined,
    skip: number,
    take: number,
  ) {
    const where: Prisma.ApplicationWhereInput = {
      jobId,
      ...(status && { status }),
    };
    const [applications, total] = await Promise.all([
      this.prisma.application.findMany({
        where,
        skip,
        take,
        orderBy: { appliedAt: "desc" },
        select: {
          id: true,
          status: true,
          appliedAt: true,
          coverLetter: true,
          talent: {
            select: {
              id: true,
              slug: true,
              headline: true,
              level: true,
              user: { select: { name: true } },
              skills: { include: { skill: true } },
            },
          },
        },
      }),
      this.prisma.application.count({ where }),
    ]);
    return { applications, total };
  }

  findApplicationWithJobOwner(id: string) {
    return this.prisma.application.findUnique({
      where: { id },
      select: {
        id: true,
        status: true,
        job: { select: { employer: { select: { userId: true } } } },
      },
    });
  }

  // Only writes if status still matches what the caller last read, so two
  // concurrent PATCHes against the same application can't silently overwrite
  // one another (last-write-wins). Returns null if the row moved underneath us.
  async updateApplication(
    id: string,
    expectedStatus: ApplicationStatus,
    status: ApplicationStatus,
    notes: string | undefined,
  ): Promise<Application | null> {
    const { count } = await this.prisma.application.updateMany({
      where: { id, status: expectedStatus },
      data: { status, ...(notes !== undefined && { notes }) },
    });
    if (count === 0) return null;

    return this.prisma.application.findUnique({ where: { id } });
  }
}
