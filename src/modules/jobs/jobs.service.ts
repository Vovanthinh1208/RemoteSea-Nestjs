import { Injectable } from "@nestjs/common";
import type { Prisma, Job } from "@prisma/client";
import { nanoid } from "nanoid";
import { JobsRepository } from "./jobs.repository";
import type { ListJobsDto } from "./dto/list-jobs.dto";
import type { CreateJobDto } from "./dto/create-job.dto";
import type { UpdateJobDto } from "./dto/update-job.dto";
import type { JobListPagination } from "./interfaces";
import { slugify } from "@/common/utils/slugify";
import {
  BadRequestApiException,
  ForbiddenApiException,
  NotFoundApiException,
} from "@/common/exceptions/api.exception";
import type { AuthenticatedUser } from "@/common/interfaces/authenticated-user.interface";

@Injectable()
export class JobsService {
  constructor(private readonly jobsRepository: JobsRepository) {}

  async list(query: ListJobsDto) {
    const { q, type, level, country, category, page, limit } = query;
    const skip = (page - 1) * limit;
    const where: Prisma.JobWhereInput = {
      status: "ACTIVE",
      publishedAt: { not: null, lte: new Date() },
      ...(type && { jobType: type }),
      ...(level && { level }),
      ...(country && { country }),
      ...(q && {
        OR: [
          { title: { contains: q, mode: "insensitive" } },
          { description: { contains: q, mode: "insensitive" } },
        ],
      }),
      ...(category && { categories: { some: { category: { slug: category } } } }),
    };

    const [jobs, total] = await Promise.all([
      this.jobsRepository.findMany(where, skip, limit),
      this.jobsRepository.count(where),
    ]);

    const pagination: JobListPagination = { page, limit, total, pages: Math.ceil(total / limit) };
    return { jobs, pagination };
  }

  async getActiveById(id: string) {
    const job = await this.jobsRepository.findActiveById(id);
    if (!job) {
      throw new NotFoundApiException("Job not found");
    }

    void this.jobsRepository.incrementViewCount(job.id).catch(() => undefined);

    return job;
  }

  async create(userId: string, dto: CreateJobDto) {
    if (dto.salaryMax < dto.salaryMin) {
      throw new BadRequestApiException("salaryMax must be greater than or equal to salaryMin");
    }

    const employer = await this.jobsRepository.findEmployerProfileByUserId(userId);
    if (!employer) {
      throw new ForbiddenApiException("Employer profile required");
    }

    const { categoryIds, skillIds, ...jobData } = dto;

    return this.jobsRepository.create({
      ...jobData,
      employer: { connect: { id: employer.id } },
      slug: `${slugify(jobData.title)}-${nanoid(6)}`,
      status: "DRAFT",
      categories: { create: categoryIds.map((categoryId) => ({ categoryId })) },
      ...(skillIds.length && { skills: { create: skillIds.map((skillId) => ({ skillId })) } }),
    });
  }

  async update(id: string, user: AuthenticatedUser, dto: UpdateJobDto): Promise<Job> {
    const job = await this.jobsRepository.findById(id);
    if (!job) {
      throw new NotFoundApiException("Job not found");
    }

    const isAdmin = user.role === "ADMIN";
    const isOwner = job.employer.userId === user.id;

    if (!isAdmin) {
      if (!isOwner) {
        throw new ForbiddenApiException();
      }
      if (job.status !== "DRAFT" && job.status !== "REJECTED") {
        throw new ForbiddenApiException("Only draft or rejected jobs can be edited");
      }
    }

    return this.jobsRepository.update(id, dto);
  }
}
