import { Injectable } from "@nestjs/common";
import type { Prisma, Job } from "@prisma/client";
import { PrismaService } from "@/core/database/prisma.service";

const jobListInclude = {
  employer: { select: { companyName: true, logoUrl: true, slug: true } },
  categories: { include: { category: true } },
  skills: { include: { skill: true } },
} satisfies Prisma.JobInclude;

const jobDetailInclude = {
  employer: { select: { companyName: true, logoUrl: true, slug: true, isVerified: true } },
  categories: { include: { category: true } },
  skills: { include: { skill: true } },
} satisfies Prisma.JobInclude;

@Injectable()
export class JobsRepository {
  constructor(private readonly prisma: PrismaService) {}

  findMany(where: Prisma.JobWhereInput, skip: number, take: number) {
    return this.prisma.job.findMany({
      where,
      skip,
      take,
      orderBy: [{ isFeatured: "desc" }, { publishedAt: "desc" }],
      include: jobListInclude,
    });
  }

  count(where: Prisma.JobWhereInput): Promise<number> {
    return this.prisma.job.count({ where });
  }

  findActiveById(id: string) {
    return this.prisma.job.findFirst({
      where: { id, status: "ACTIVE" },
      include: jobDetailInclude,
    });
  }

  findById(id: string) {
    return this.prisma.job.findUnique({
      where: { id },
      include: { employer: { select: { userId: true } } },
    });
  }

  incrementViewCount(id: string): Promise<Job> {
    return this.prisma.job.update({ where: { id }, data: { viewCount: { increment: 1 } } });
  }

  findEmployerProfileByUserId(userId: string) {
    return this.prisma.employerProfile.findUnique({ where: { userId }, select: { id: true } });
  }

  create(data: Prisma.JobCreateInput) {
    return this.prisma.job.create({
      data,
      select: { id: true, slug: true, status: true },
    });
  }

  update(id: string, data: Prisma.JobUpdateInput): Promise<Job> {
    return this.prisma.job.update({ where: { id }, data });
  }
}
