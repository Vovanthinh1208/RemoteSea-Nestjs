import { Injectable, Logger } from "@nestjs/common";
import type { Job } from "@prisma/client";
import { JobsRepository } from "./jobs.repository";
import type { ListJobsDto } from "./dto/list-jobs.dto";
import type { CreateJobDto } from "./dto/create-job.dto";
import type { UpdateJobDto } from "./dto/update-job.dto";
import { buildJobOrderBy, buildJobWhere, computeFacets } from "./job-search.util";
import { uniqueSlug } from "@/common/utils/slugify";
import { buildPagination, paginationSkip } from "@/common/utils/paginate";
import {
  BadRequestApiException,
  ForbiddenApiException,
  NotFoundApiException,
} from "@/common/exceptions/api.exception";
import type { AuthenticatedUser } from "@/common/interfaces/authenticated-user.interface";

@Injectable()
export class JobsService {
  private readonly logger = new Logger(JobsService.name);

  constructor(private readonly jobsRepository: JobsRepository) {}

  async list(query: ListJobsDto) {
    const { page, limit } = query;
    const skip = paginationSkip(page, limit);
    const where = buildJobWhere(query);
    const orderBy = buildJobOrderBy(query.sort);

    const [jobs, total, facetRows] = await Promise.all([
      this.jobsRepository.findMany(where, skip, limit, orderBy),
      this.jobsRepository.count(where),
      this.jobsRepository.findFacetRows(),
    ]);

    return { jobs, pagination: buildPagination(page, limit, total), facets: computeFacets(facetRows) };
  }

  async getActiveById(id: string) {
    const job = await this.jobsRepository.findActiveById(id);
    if (!job) {
      throw new NotFoundApiException("Job not found");
    }

    void this.jobsRepository.incrementViewCount(job.id).catch((error: unknown) => {
      this.logger.warn(
        `Failed to increment view count for job ${job.id}`,
        error instanceof Error ? error.stack : error
      );
    });

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
      slug: uniqueSlug(jobData.title),
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

    if (isAdmin) {
      return this.jobsRepository.update(id, dto);
    }

    if (!isOwner) {
      throw new ForbiddenApiException();
    }
    if (job.status !== "DRAFT" && job.status !== "REJECTED") {
      throw new ForbiddenApiException("Only draft or rejected jobs can be edited");
    }

    // Re-checks the DRAFT/REJECTED condition atomically at write time: the read
    // above can go stale if an admin concurrently approves/rejects the job
    // between this owner's read and write, which would otherwise let an edit
    // land on a job that's no longer editable with no error at all.
    const updated = await this.jobsRepository.updateIfEditable(id, dto);
    if (!updated) {
      throw new ForbiddenApiException("Only draft or rejected jobs can be edited");
    }
    return updated;
  }
}
