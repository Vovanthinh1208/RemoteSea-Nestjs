import { Injectable } from "@nestjs/common";
import type { Prisma, Job } from "@prisma/client";
import { PrismaService } from "@/core/database/prisma.service";
import {
  activeJobBaseWhere,
  facetSelect,
  type FacetRow,
} from "./job-search.util";
import { omitInternalJobFields } from "@/common/types/job-with-relations.type";

export type PublicJob = Omit<Job, "stripeSessionId" | "reviewNote">;

const jobDetailInclude = {
  employer: {
    select: {
      companyName: true,
      logoUrl: true,
      slug: true,
      isVerified: true,
      size: true,
      description: true,
      hqCountry: true,
    },
  },
  categories: { include: { category: true } },
  skills: { include: { skill: true } },
} satisfies Prisma.JobInclude;

// Only the fields actually read by frontend consumers of this endpoint (JobCard,
// plus RecommendedJobs' skill-based "why recommended" line) — the list previously
// reused the full jobWithRelationsInclude (every Job scalar, including
// description/requirements/benefits/stripeSessionId/reviewNote) for every card
// on every page of results.
const jobListItemSelect = {
  id: true,
  title: true,
  jobType: true,
  level: true,
  salaryMin: true,
  salaryMax: true,
  isRemote: true,
  timezone: true,
  country: true,
  isFeatured: true,
  vnHireCount: true,
  publishedAt: true,
  createdAt: true,
  employer: { select: { companyName: true, isVerified: true } },
  categories: {
    select: {
      category: { select: { id: true, name: true, slug: true, icon: true } },
    },
  },
  skills: {
    select: { skill: { select: { id: true, name: true, slug: true } } },
  },
} satisfies Prisma.JobSelect;

export type JobListItem = Prisma.JobGetPayload<{
  select: typeof jobListItemSelect;
}>;

@Injectable()
export class JobsRepository {
  constructor(private readonly prisma: PrismaService) {}

  findMany(
    where: Prisma.JobWhereInput,
    skip: number,
    take: number,
    orderBy: Prisma.JobOrderByWithRelationInput[] = [
      { isFeatured: "desc" },
      { publishedAt: "desc" },
    ],
  ): Promise<JobListItem[]> {
    return this.prisma.job.findMany({
      where,
      skip,
      take,
      orderBy,
      select: jobListItemSelect,
    });
  }

  count(where: Prisma.JobWhereInput): Promise<number> {
    return this.prisma.job.count({ where });
  }

  findFacetRows(): Promise<FacetRow[]> {
    return this.prisma.job.findMany({
      where: activeJobBaseWhere(),
      select: facetSelect,
    });
  }

  async findActiveById(id: string) {
    const job = await this.prisma.job.findFirst({
      where: { id, status: "ACTIVE" },
      include: jobDetailInclude,
    });
    return job && omitInternalJobFields(job);
  }

  findById(id: string) {
    return this.prisma.job.findUnique({
      where: { id },
      include: { employer: { select: { userId: true } } },
    });
  }

  incrementViewCount(id: string): Promise<Job> {
    return this.prisma.job.update({
      where: { id },
      data: { viewCount: { increment: 1 } },
    });
  }

  findEmployerProfileByUserId(userId: string) {
    return this.prisma.employerProfile.findUnique({
      where: { userId },
      select: { id: true },
    });
  }

  create(data: Prisma.JobCreateInput) {
    return this.prisma.job.create({
      data,
      select: { id: true, slug: true, status: true },
    });
  }

  async update(id: string, data: Prisma.JobUpdateInput): Promise<PublicJob> {
    const job = await this.prisma.job.update({ where: { id }, data });
    return omitInternalJobFields(job);
  }

  // Only writes if the job is still DRAFT/REJECTED, so an owner's edit can't
  // silently land on a job an admin concurrently approved/rejected in between.
  async updateIfEditable(
    id: string,
    data: Prisma.JobUpdateInput,
  ): Promise<PublicJob | null> {
    const { count } = await this.prisma.job.updateMany({
      where: { id, status: { in: ["DRAFT", "REJECTED"] } },
      data,
    });
    if (count === 0) return null;

    const job = await this.prisma.job.findUnique({ where: { id } });
    return job && omitInternalJobFields(job);
  }
}
