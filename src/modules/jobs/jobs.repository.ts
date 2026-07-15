import { Injectable } from "@nestjs/common";
import type { Prisma, Job } from "@prisma/client";
import { PrismaService } from "@/core/database/prisma.service";
import {
  activeJobBaseWhere,
  facetSelect,
  type FacetRow,
} from "./job-search.util";
import { omitInternalJobFields } from "@/common/types/job-with-relations.type";
import {
  jobListItemSelect,
  type JobListItem,
} from "@/common/types/job-list-item.type";

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

  // Backs JobOwnershipGuard + JobsService.update — narrow select, not the full Job
  // row: those are the only fields that method reads.
  findById(id: string) {
    return this.prisma.job.findUnique({
      where: { id },
      select: {
        id: true,
        status: true,
        salaryMin: true,
        salaryMax: true,
        employer: { select: { userId: true } },
      },
    });
  }

  // updateMany (not update) so a job deleted between the view and the buffered
  // flush is a silent no-op instead of a thrown P2025.
  async incrementViewCountBy(id: string, count: number): Promise<void> {
    await this.prisma.job.updateMany({
      where: { id },
      data: { viewCount: { increment: count } },
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
