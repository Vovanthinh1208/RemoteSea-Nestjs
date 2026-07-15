import { Inject, Injectable } from "@nestjs/common";
import { CACHE_MANAGER, type Cache } from "@nestjs/cache-manager";
import { JobsRepository, type PublicJob } from "./jobs.repository";
import type { ListJobsDto } from "./dto/list-jobs.dto";
import type { CreateJobDto } from "./dto/create-job.dto";
import type { UpdateJobDto } from "./dto/update-job.dto";
import {
  buildJobOrderBy,
  buildJobWhere,
  computeFacets,
  type Facets,
} from "./job-search.util";
import { uniqueSlug } from "@/common/utils/slugify";
import { buildPagination, paginationSkip } from "@/common/utils/paginate";
import { getOrSetCache } from "@/common/caching/cache.util";
import {
  ForbiddenApiException,
  NotFoundApiException,
} from "@/common/exceptions/api.exception";
import { ErrorCode } from "@/common/exceptions/error-codes";
import type { AuthenticatedUser } from "@/common/interfaces/authenticated-user.interface";
import type { JobWithOwner } from "./guards/job-ownership.guard";
import { SalaryRange } from "./salary-range";
import { ViewCountBuffer } from "./view-count.buffer";

// Facets are a single global aggregate (findFacetRows() ignores the caller's search
// filters entirely — see job-search.util.ts), so a flat cache key is correct: every
// GET /jobs request, regardless of query params, shares the same cached facets.
const FACETS_CACHE_KEY = "jobs:facets";
const FACETS_CACHE_TTL_MS = 60_000;

@Injectable()
export class JobsService {
  constructor(
    private readonly jobsRepository: JobsRepository,
    @Inject(CACHE_MANAGER) private readonly cache: Cache,
    private readonly viewCounts: ViewCountBuffer,
  ) {}

  async list(query: ListJobsDto) {
    const { page, limit } = query;
    const skip = paginationSkip(page, limit);
    const where = buildJobWhere(query);
    const orderBy = buildJobOrderBy(query.sort);

    const [jobs, total, facets] = await Promise.all([
      this.jobsRepository.findMany(where, skip, limit, orderBy),
      this.jobsRepository.count(where),
      getOrSetCache<Facets>(
        this.cache,
        FACETS_CACHE_KEY,
        FACETS_CACHE_TTL_MS,
        async () => computeFacets(await this.jobsRepository.findFacetRows()),
      ),
    ]);

    return {
      jobs,
      pagination: buildPagination(page, limit, total),
      facets,
    };
  }

  async getActiveById(id: string) {
    const job = await this.jobsRepository.findActiveById(id);
    if (!job) {
      throw new NotFoundApiException("Job not found", ErrorCode.JOB_NOT_FOUND);
    }

    // Buffered, not a per-view UPDATE — see ViewCountBuffer for the rationale.
    this.viewCounts.record(job.id);

    return job;
  }

  async create(userId: string, dto: CreateJobDto) {
    SalaryRange.create(dto.salaryMin, dto.salaryMax);

    const employer =
      await this.jobsRepository.findEmployerProfileByUserId(userId);
    if (!employer) {
      throw new ForbiddenApiException(
        "Employer profile required",
        ErrorCode.EMPLOYER_PROFILE_REQUIRED,
      );
    }

    const { categoryIds, skillIds, ...jobData } = dto;

    return this.jobsRepository.create({
      ...jobData,
      employer: { connect: { id: employer.id } },
      slug: uniqueSlug(jobData.title),
      status: "DRAFT",
      categories: { create: categoryIds.map((categoryId) => ({ categoryId })) },
      ...(skillIds.length && {
        skills: { create: skillIds.map((skillId) => ({ skillId })) },
      }),
    });
  }

  async update(
    job: JobWithOwner,
    user: AuthenticatedUser,
    dto: UpdateJobDto,
  ): Promise<PublicJob> {
    // Ownership (or ADMIN membership) is already enforced by JobOwnershipGuard
    // before this method runs — `job` here is the same row the guard fetched.
    const isAdmin = user.role === "ADMIN";

    if (isAdmin) {
      return this.jobsRepository.update(job.id, dto);
    }

    if (job.status !== "DRAFT" && job.status !== "REJECTED") {
      throw new ForbiddenApiException(
        "Only draft or rejected jobs can be edited",
        ErrorCode.JOB_NOT_EDITABLE,
      );
    }

    // create() validates the raw DTO (both fields always present); a PATCH can
    // change just one of the two, so this validates the *effective* post-update
    // range instead of whichever field happens to be present in this request.
    SalaryRange.merge(job, dto);

    // Re-checks the DRAFT/REJECTED condition atomically at write time: the read
    // above can go stale if an admin concurrently approves/rejects the job
    // between this owner's read and write, which would otherwise let an edit
    // land on a job that's no longer editable with no error at all.
    const updated = await this.jobsRepository.updateIfEditable(job.id, dto);
    if (!updated) {
      throw new ForbiddenApiException(
        "Only draft or rejected jobs can be edited",
        ErrorCode.JOB_NOT_EDITABLE,
      );
    }
    return updated;
  }
}
