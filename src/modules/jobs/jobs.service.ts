import { Inject, Injectable } from "@nestjs/common";
import { CACHE_MANAGER, type Cache } from "@nestjs/cache-manager";
import type { Prisma } from "@prisma/client";
import { JobsRepository, type PublicJob } from "./jobs.repository";
import type { JobListItem } from "@/common/types/job-list-item.type";
import type { ListJobsDto } from "./dto/list-jobs.dto";
import type { CreateJobDto } from "./dto/create-job.dto";
import type { UpdateJobDto } from "./dto/update-job.dto";
import {
  assembleFacets,
  buildJobOrderBy,
  buildJobWhere,
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

    const [{ jobs, total }, facets] = await Promise.all([
      query.q
        ? this.listBySearch(query, query.q, skip, limit)
        : this.listByFilter(query, skip, limit),
      getOrSetCache<Facets>(
        this.cache,
        FACETS_CACHE_KEY,
        FACETS_CACHE_TTL_MS,
        async () => {
          const [counts, categoryRows] = await Promise.all([
            this.jobsRepository.findFacetCounts(),
            this.jobsRepository.findCategoryFacetCounts(),
          ]);
          return assembleFacets(counts, categoryRows);
        },
      ),
    ]);

    return {
      jobs,
      pagination: buildPagination(page, limit, total),
      facets,
    };
  }

  private async listByFilter(
    query: ListJobsDto,
    skip: number,
    limit: number,
  ): Promise<{ jobs: JobListItem[]; total: number }> {
    const where = buildJobWhere(query);
    const orderBy = buildJobOrderBy(query.sort);

    const [jobs, total] = await Promise.all([
      this.jobsRepository.findMany(where, skip, limit, orderBy),
      this.jobsRepository.count(where),
    ]);
    return { jobs, total };
  }

  // "relevance" (how well a job matches `q`) isn't a jobs column, so it can't
  // be a Prisma `orderBy` — findSearchRankedIds ranks matches in one raw SQL
  // query, and every other filter (type/level/country/category/timezone/
  // salary) still runs through the exact same buildJobWhere() the non-search
  // path uses, just narrowed to `id: { in: rankedIds } }`. An explicit
  // sort=salary/recent still wins over relevance — a caller who asked for a
  // specific order gets it even while searching.
  private async listBySearch(
    query: ListJobsDto,
    q: string,
    skip: number,
    limit: number,
  ): Promise<{ jobs: JobListItem[]; total: number }> {
    const rankedIds = await this.jobsRepository.findSearchRankedIds(q);
    if (rankedIds.length === 0) return { jobs: [], total: 0 };

    const where: Prisma.JobWhereInput = {
      ...buildJobWhere({ ...query, q: undefined }),
      id: { in: rankedIds },
    };

    if (query.sort && query.sort !== "relevance") {
      const [jobs, total] = await Promise.all([
        this.jobsRepository.findMany(
          where,
          skip,
          limit,
          buildJobOrderBy(query.sort),
        ),
        this.jobsRepository.count(where),
      ]);
      return { jobs, total };
    }

    // rankedIds is already ordered best-match-first; findMany has no matching
    // orderBy to give it. Rather than fetching every surviving match (up to
    // SEARCH_CANDIDATE_LIMIT) with its full employer/categories/skills joins
    // just to slice one page out of it in JS, first narrow rankedIds down to
    // the ids that also satisfy `where` with a cheap id-only query, then only
    // pay for the joined select on the one page actually being returned.
    const matchingIds = new Set(await this.jobsRepository.findIds(where));
    const orderedIds = rankedIds.filter((id) => matchingIds.has(id));
    const pageIds = orderedIds.slice(skip, skip + limit);
    if (pageIds.length === 0) return { jobs: [], total: orderedIds.length };

    const pageJobs = await this.jobsRepository.findMany(
      { id: { in: pageIds } },
      0,
      pageIds.length,
    );
    // findMany's `id: { in: pageIds } }` doesn't preserve pageIds' order, so
    // re-sort the (small, page-sized) result to match relevance rank.
    const rankOf = new Map(pageIds.map((id, index) => [id, index]));
    const jobs = [...pageJobs].sort(
      (a, b) => (rankOf.get(a.id) ?? 0) - (rankOf.get(b.id) ?? 0),
    );
    return { jobs, total: orderedIds.length };
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

  // Admin-triggered (AdminService.reviewJob), not owner-triggered — but the
  // PENDING_REVIEW -> ACTIVE/REJECTED transition itself belongs here, not
  // reimplemented in AdminRepository, since this module owns every Job
  // status transition. Null means the atomic re-check found the job already
  // moved on (e.g. a second concurrent review) — the caller maps that to
  // JOB_NOT_PENDING_REVIEW.
  approveForReview(id: string) {
    return this.jobsRepository.approveJob(id);
  }

  rejectForReview(id: string, note: string | null) {
    return this.jobsRepository.rejectJob(id, note);
  }
}
