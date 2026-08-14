import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import type {
  Application,
  ApplicationStatus,
  EmployerProfile,
  JobStatus,
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

const profileWithJobCountSelect = {
  ...profileSelect,
  _count: { select: { jobs: true } },
} satisfies Prisma.EmployerProfileSelect;

export type ProfileWithJobCount = Prisma.EmployerProfileGetPayload<{
  select: typeof profileWithJobCountSelect;
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

  findProfileBySlug(slug: string): Promise<{ id: string } | null> {
    return this.prisma.employerProfile.findUnique({
      where: { slug },
      select: { id: true },
    });
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

  findProfileWithJobCount(userId: string): Promise<ProfileWithJobCount | null> {
    return this.prisma.employerProfile.findUnique({
      where: { userId },
      select: profileWithJobCountSelect,
    });
  }

  // A single aggregate instead of loading every job row's per-job application
  // count into memory just to sum them (the previous approach, and also
  // unbounded — unlike findJobsByEmployer it had no cap on job count either).
  countApplicationsForOwner(userId: string): Promise<number> {
    return this.prisma.application.count({
      where: { job: { employer: { userId } } },
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

  setVerified(id: string, isVerified: boolean): Promise<EmployerProfile> {
    return this.prisma.employerProfile.update({
      where: { id },
      // Only stamps verifiedAt when actually becoming verified — the
      // suspend() path below is the one dedicated route to isVerified=false
      // today, and it stamps its own suspendedAt instead.
      data: { isVerified, ...(isVerified && { verifiedAt: new Date() }) },
    });
  }

  // Single transaction, not two separate writes: an employer left verified
  // with all jobs closed (or suspended with jobs still live) is a worse
  // inconsistency than the suspend failing outright. Moved here (from
  // AdminRepository) since "what does suspending an employer mean" — the
  // isVerified flip and the job-closing cascade together — is this module's
  // domain rule to own, not Admin's to reimplement.
  async suspend(id: string): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.employerProfile.update({
        where: { id },
        data: { isVerified: false, suspendedAt: new Date() },
      }),
      this.prisma.job.updateMany({
        where: { employerId: id, status: "ACTIVE" },
        data: { status: "CLOSED" },
      }),
    ]);
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
        // Below: not rendered by the jobs list itself — carried so the
        // frontend can score this job's applicants against it (see
        // ApplicantsPanel's match badge) without a second fetch.
        level: true,
        salaryMin: true,
        salaryMax: true,
        currency: true,
        jobType: true,
        timezone: true,
        country: true,
        isRemote: true,
        skills: {
          select: {
            isRequired: true,
            skill: { select: { id: true } },
          },
        },
      },
    });
  }

  async getEmployerJobStats(employerId: string): Promise<{
    totalApps: number;
    shortlisted: number;
    avgTimeToHireInDays: number;
  }> {
    const [totalApps, shortlisted, avgRows] = await Promise.all([
      this.prisma.application.count({ where: { job: { employerId } } }),
      this.prisma.application.count({
        where: { job: { employerId }, status: "SHORTLISTED" },
      }),
      // Averages appliedAt -> updatedAt in SQL instead of pulling every OFFERED
      // application row (unbounded per employer) into app memory just to
      // average two dates in JS.
      this.prisma.$queryRaw<Array<{ avgDays: number | null }>>(Prisma.sql`
        SELECT AVG(EXTRACT(EPOCH FROM (a."updatedAt" - a."appliedAt")) / 86400.0)::float AS "avgDays"
        FROM applications a
        JOIN jobs j ON j.id = a."jobId"
        WHERE j."employerId" = ${employerId} AND a.status = 'OFFERED'
      `),
    ]);

    const avgDays = avgRows[0]?.avgDays ?? null;
    return {
      totalApps,
      shortlisted,
      avgTimeToHireInDays: avgDays === null ? 0 : Math.round(avgDays * 10) / 10,
    };
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
              // Below: same "not rendered directly, feeds the frontend's
              // match-score calculation against the job" rationale as the
              // job fields added to findJobsByEmployer's select above —
              // already surfaced to anyone viewing this talent's public
              // profile (see talent/interfaces.ts's publicProfileArgs).
              yearsExperience: true,
              desiredSalaryMin: true,
              desiredSalaryMax: true,
              currency: true,
              timezone: true,
              country: true,
              employmentTypes: true,
              timezoneOverlap: true,
              rightToWork: true,
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
