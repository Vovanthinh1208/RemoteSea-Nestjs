import { applyDecorators } from "@nestjs/common";
import { ApiBearerAuth, ApiBody, ApiCreatedResponse, ApiOkResponse, ApiOperation, ApiParam, ApiQuery, ApiTags } from "@nestjs/swagger";
import { InternalServerErrorApiResponse, UnauthorizedApiResponse } from "@/core/swagger/common.responses";
import { JOB_TYPE_VALUES, EXPERIENCE_LEVEL_VALUES } from "@/common/constants/enum-values.constants";
import { CreateJobRequestDto, CreateJobResponseDto, JobDetailResponseDto, ListJobsResponseDto, UpdateJobRequestDto } from "./jobs.dto";
import {
  CreateJobRequestExample,
  CreateJobResponseExample,
  JobDetailResponseExample,
  ListJobsResponseExample,
  UpdateJobRequestExample,
} from "./jobs.examples";
import {
  EmployerProfileRequiredResponse,
  InvalidSalaryRangeResponse,
  JobNotFoundResponse,
  NotOwnerOrNotEditableResponse,
  ValidationErrorResponse,
} from "./jobs.responses";

export const ApiJobsTag = () => applyDecorators(ApiTags("Jobs"));

export const ApiListJobs = () =>
  applyDecorators(
    ApiOperation({
      summary: "Search/list active jobs",
      description:
        "Public job search/listing — only jobs with `status: ACTIVE` that are already published are returned. " +
        "Ordered `isFeatured desc, publishedAt desc` by default, or `salaryMax desc, publishedAt desc` when `sort=salary`. " +
        "`type`/`level`/`category`/`timezone` each accept either a single value (repeat the same query key for multiple, " +
        "e.g. `type=CONTRACT&type=FREELANCE`) — ported from the original app's richer jobs/page.tsx filter set, which " +
        "was never a REST endpoint in the original app. `facets` in the response is always computed over ALL active jobs, " +
        "independent of the filters applied to `jobs`/`pagination`, matching that original page's facetRows behavior. " +
        "No authentication required.",
    }),
    ApiQuery({ name: "q", required: false, type: String, description: "Free-text search over title/description" }),
    ApiQuery({
      name: "type",
      required: false,
      isArray: true,
      enum: JOB_TYPE_VALUES,
      description: "Repeat for multiple (OR'd together)",
    }),
    ApiQuery({
      name: "level",
      required: false,
      isArray: true,
      enum: EXPERIENCE_LEVEL_VALUES,
      description: "Repeat for multiple (OR'd together)",
    }),
    ApiQuery({ name: "country", required: false, type: String, example: "Vietnam" }),
    ApiQuery({
      name: "category",
      required: false,
      isArray: true,
      type: String,
      description: "Category slug(s); repeat for multiple",
      example: "engineering",
    }),
    ApiQuery({
      name: "timezone",
      required: false,
      isArray: true,
      enum: ["sea", "async", "SG", "AU", "US"],
      description:
        "Preset region buckets: sea = SEA countries or UTC+7/+8; async = timezone contains \"async\"; SG/AU/US = exact country match",
    }),
    ApiQuery({ name: "salaryMin", required: false, type: Number, description: "Minimum monthly salary, floor 500 if omitted alongside salaryMax" }),
    ApiQuery({ name: "salaryMax", required: false, type: Number, description: "Maximum monthly salary, ceiling 8000 if omitted alongside salaryMin" }),
    ApiQuery({ name: "sort", required: false, enum: ["recent", "salary", "featured"], description: "Default: recent (featured-first, then newest)" }),
    ApiQuery({ name: "page", required: false, type: Number, example: 1 }),
    ApiQuery({ name: "limit", required: false, type: Number, example: 20 }),
    ApiOkResponse({ description: "Paginated jobs with filter facet counts", type: ListJobsResponseDto, schema: { example: ListJobsResponseExample } }),
    ValidationErrorResponse,
    InternalServerErrorApiResponse
  );

export const ApiCreateJob = () =>
  applyDecorators(
    ApiBearerAuth("bearer"),
    ApiOperation({
      summary: "Create a job",
      description:
        "Creates a new job in DRAFT status for the authenticated employer. This route requires only a valid JWT — there is NO @Roles() guard; the service requires an existing EmployerProfile for the caller (403 if missing).",
    }),
    ApiBody({ type: CreateJobRequestDto, examples: { default: { value: CreateJobRequestExample } } }),
    ApiCreatedResponse({ description: "Job created", type: CreateJobResponseDto, schema: { example: CreateJobResponseExample } }),
    InvalidSalaryRangeResponse,
    UnauthorizedApiResponse,
    EmployerProfileRequiredResponse,
    InternalServerErrorApiResponse
  );

export const ApiGetJobById = () =>
  applyDecorators(
    ApiOperation({
      summary: "Get a job by id",
      description:
        "Fetches a single job — only if `status: ACTIVE` (drafts/pending/closed/rejected 404, even for the owner). Fires an async, best-effort viewCount increment. No authentication required.",
    }),
    ApiParam({ name: "id", description: "Job id", example: "cljob1a2b3c4d5e6f7g8h9i0" }),
    ApiOkResponse({ description: "Job detail", type: JobDetailResponseDto, schema: { example: JobDetailResponseExample } }),
    JobNotFoundResponse,
    InternalServerErrorApiResponse
  );

export const ApiUpdateJob = () =>
  applyDecorators(
    ApiBearerAuth("bearer"),
    ApiOperation({
      summary: "Update a job",
      description:
        "Updates a job. Cannot change categoryIds/skillIds here. This route requires only a valid JWT — there is NO @Roles() guard; role/ownership logic lives in the service: ADMIN bypasses all checks, otherwise the caller must own the job (`job.employer.userId === user.id`) AND the job must be DRAFT or REJECTED.",
    }),
    ApiParam({ name: "id", description: "Job id", example: "cljob1a2b3c4d5e6f7g8h9i0" }),
    ApiBody({ type: UpdateJobRequestDto, examples: { default: { value: UpdateJobRequestExample } } }),
    ApiOkResponse({ description: "Updated job", type: JobDetailResponseDto, schema: { example: JobDetailResponseExample } }),
    ValidationErrorResponse,
    UnauthorizedApiResponse,
    NotOwnerOrNotEditableResponse,
    JobNotFoundResponse,
    InternalServerErrorApiResponse
  );
