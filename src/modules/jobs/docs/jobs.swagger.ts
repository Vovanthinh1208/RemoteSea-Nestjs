import { applyDecorators } from "@nestjs/common";
import { ApiBearerAuth, ApiBody, ApiCreatedResponse, ApiOkResponse, ApiOperation, ApiParam, ApiQuery, ApiTags } from "@nestjs/swagger";
import { InternalServerErrorApiResponse, UnauthorizedApiResponse } from "@/core/swagger/common.responses";
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
        "Public job search/listing — only jobs with `status: ACTIVE` that are already published are returned, ordered `isFeatured desc, publishedAt desc`. No authentication required.",
    }),
    ApiQuery({ name: "q", required: false, type: String, description: "Free-text search over title/description" }),
    ApiQuery({ name: "type", required: false, enum: ["FULL_TIME", "PART_TIME", "CONTRACT", "FREELANCE"] }),
    ApiQuery({ name: "level", required: false, enum: ["ENTRY", "MID", "SENIOR", "LEAD", "EXECUTIVE"] }),
    ApiQuery({ name: "country", required: false, type: String, example: "Vietnam" }),
    ApiQuery({ name: "category", required: false, type: String, description: "Category slug", example: "engineering" }),
    ApiQuery({ name: "page", required: false, type: Number, example: 1 }),
    ApiQuery({ name: "limit", required: false, type: Number, example: 20 }),
    ApiOkResponse({ description: "Paginated jobs", type: ListJobsResponseDto, schema: { example: ListJobsResponseExample } }),
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
