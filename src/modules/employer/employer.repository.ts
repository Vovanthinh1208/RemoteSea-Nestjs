import { Injectable } from "@nestjs/common";
import type { Application, ApplicationStatus, EmployerProfile, JobStatus, Prisma } from "@prisma/client";
import { PrismaService } from "@/core/database/prisma.service";

@Injectable()
export class EmployerRepository {
  constructor(private readonly prisma: PrismaService) {}

  findProfileByUserId(userId: string): Promise<{ id: string } | null> {
    return this.prisma.employerProfile.findUnique({
      where: { userId },
      select: { id: true },
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
    slug: string
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

  findProfileWithApplicationCounts(userId: string) {
    return this.prisma.employerProfile.findUnique({
      where: { userId },
      include: {
        _count: { select: { jobs: true } },
        jobs: { select: { _count: { select: { applications: true } } } },
      },
    });
  }

  updateProfile(id: string, data: Prisma.EmployerProfileUpdateInput): Promise<EmployerProfile> {
    return this.prisma.employerProfile.update({ where: { id }, data });
  }

  findJobsByEmployer(employerId: string, status?: JobStatus) {
    return this.prisma.job.findMany({
      where: { employerId, ...(status && { status }) },
      orderBy: { createdAt: "desc" },
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
      select: { employer: { select: { userId: true } } },
    });
  }

  async findApplicationsForJob(
    jobId: string,
    status: ApplicationStatus | undefined,
    skip: number,
    take: number
  ) {
    const where: Prisma.ApplicationWhereInput = { jobId, ...(status && { status }) };
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
      select: { status: true, job: { select: { employer: { select: { userId: true } } } } },
    });
  }

  updateApplication(
    id: string,
    status: ApplicationStatus,
    notes: string | undefined
  ): Promise<Application> {
    return this.prisma.application.update({
      where: { id },
      data: { status, ...(notes !== undefined && { notes }) },
    });
  }
}
