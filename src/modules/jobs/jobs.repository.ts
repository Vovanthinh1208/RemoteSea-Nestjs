import { Injectable } from "@nestjs/common";
import type { Prisma, Job } from "@prisma/client";
import { PrismaService } from "@/core/database/prisma.service";
import {
  activeJobBaseWhere,
  facetSelect,
  type FacetRow,
} from "./job-search.util";
import { jobWithRelationsInclude } from "@/common/types/job-with-relations.type";

// stripeSessionId (a payment identifier) and reviewNote (the admin's internal
// rejection note) are never meant to reach a client response. Prisma's `omit`
// option isn't usable here (this client's generated types reject it), so strip
// them manually instead.
export type PublicJob = Omit<Job, "stripeSessionId" | "reviewNote">;

function toPublicJob({
  stripeSessionId: _stripeSessionId,
  reviewNote: _reviewNote,
  ...publicJob
}: Job): PublicJob {
  return publicJob;
}

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
  ) {
    return this.prisma.job.findMany({
      where,
      skip,
      take,
      orderBy,
      include: jobWithRelationsInclude,
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
    return toPublicJob(job);
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
    return job && toPublicJob(job);
  }
}
