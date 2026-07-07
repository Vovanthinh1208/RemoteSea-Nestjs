import { applyDecorators } from "@nestjs/common";
import { ApiBearerAuth, ApiBody, ApiOkResponse, ApiOperation, ApiParam, ApiQuery, ApiTags } from "@nestjs/swagger";
import { ForbiddenApiResponse, InternalServerErrorApiResponse, UnauthorizedApiResponse } from "@/core/swagger/common.responses";
import { JOB_STATUS_VALUES } from "@/common/constants/enum-values.constants";
import {
  ListEmployersResponseDto,
  ListJobsResponseDto,
  ReviewJobRequestDto,
  ReviewJobResponseDto,
  RevenueResponseDto,
  UpdateEmployerRequestDto,
  UpdateEmployerResponseDto,
} from "./admin.dto";
import {
  ListEmployersResponseExample,
  ListJobsResponseExample,
  ReviewJobApprovedResponseExample,
  ReviewJobRequestApproveExample,
  ReviewJobRequestRejectExample,
  RevenueResponseExample,
  UpdateEmployerRequestExample,
  UpdateEmployerResponseExample,
} from "./admin.examples";
import { EmployerNotFoundResponse, JobNotFoundResponse, ValidationErrorResponse } from "./admin.responses";

export const ApiAdminTag = () => applyDecorators(ApiTags("Admin"), ApiBearerAuth("bearer"));

export const ApiListEmployers = () =>
  applyDecorators(
    ApiOperation({
      summary: "List employers for moderation",
      description:
        "Lists employer profiles for moderation with computed job count and total ad spend, paginated. Requires ADMIN role.",
    }),
    ApiQuery({ name: "verified", required: false, enum: ["true", "false"], description: "Filters on EmployerProfile.isVerified" }),
    ApiQuery({ name: "page", required: false, type: Number, example: 1 }),
    ApiQuery({ name: "limit", required: false, type: Number, example: 20 }),
    ApiOkResponse({
      description:
        "Paginated employer list. Each item includes both raw `_count.jobs` and a duplicated `jobCount`, plus computed `totalSpend`",
      type: ListEmployersResponseDto,
      schema: { example: ListEmployersResponseExample },
    }),
    ValidationErrorResponse,
    UnauthorizedApiResponse,
    ForbiddenApiResponse,
    InternalServerErrorApiResponse
  );

export const ApiUpdateEmployer = () =>
  applyDecorators(
    ApiOperation({
      summary: "Verify or suspend an employer",
      description:
        "Verifies or suspends an employer. Suspending force-closes (status: CLOSED) all of that employer's ACTIVE jobs, transactionally. Requires ADMIN role.",
    }),
    ApiParam({ name: "id", description: "EmployerProfile id" }),
    ApiBody({ type: UpdateEmployerRequestDto, examples: { default: { value: UpdateEmployerRequestExample } } }),
    ApiOkResponse({ description: "Employer updated", type: UpdateEmployerResponseDto, schema: { example: UpdateEmployerResponseExample } }),
    ValidationErrorResponse,
    UnauthorizedApiResponse,
    ForbiddenApiResponse,
    EmployerNotFoundResponse,
    InternalServerErrorApiResponse
  );

export const ApiListJobs = () =>
  applyDecorators(
    ApiOperation({
      summary: "List jobs for moderation",
      description: "Lists jobs for moderation review, filtered by status, paginated, oldest first (FIFO review queue). Requires ADMIN role.",
    }),
    ApiQuery({
      name: "status",
      required: false,
      enum: JOB_STATUS_VALUES,
      description: "Defaults to PENDING_REVIEW",
    }),
    ApiQuery({ name: "page", required: false, type: Number, example: 1 }),
    ApiQuery({ name: "limit", required: false, type: Number, example: 20 }),
    ApiOkResponse({
      description: "Paginated job list with partial `employer` and `categories` (no `skills` include)",
      type: ListJobsResponseDto,
      schema: { example: ListJobsResponseExample },
    }),
    ValidationErrorResponse,
    UnauthorizedApiResponse,
    ForbiddenApiResponse,
    InternalServerErrorApiResponse
  );

export const ApiReviewJob = () =>
  applyDecorators(
    ApiOperation({
      summary: "Approve or reject a job under review",
      description:
        "Approve → status: ACTIVE, sets publishedAt, clears reviewNote, emails employer. Reject → status: REJECTED, stores note as reviewNote, emails rejection reason. Requires ADMIN role. Response is intentionally partial — only `{ status, publishedAt }` (the repository only selects those two fields), never a full Job object.",
    }),
    ApiParam({ name: "id", description: "Job id" }),
    ApiBody({
      type: ReviewJobRequestDto,
      examples: {
        approve: { summary: "Approve", value: ReviewJobRequestApproveExample },
        reject: { summary: "Reject", value: ReviewJobRequestRejectExample },
      },
    }),
    ApiOkResponse({
      description: "Job reviewed — partial Job object (`status` and `publishedAt` only)",
      type: ReviewJobResponseDto,
      schema: { example: ReviewJobApprovedResponseExample },
    }),
    ValidationErrorResponse,
    UnauthorizedApiResponse,
    ForbiddenApiResponse,
    JobNotFoundResponse,
    InternalServerErrorApiResponse
  );

export const ApiGetRevenue = () =>
  applyDecorators(
    ApiOperation({
      summary: "Get billing revenue summary",
      description:
        "Aggregates every planPaid job into a monthly time series (last 8 calendar months), an all-time breakdown by plan, and the 10 most recent paid jobs. Amounts are in cents, derived from PLAN_PRICES — there is no separate payment/transaction table. Requires ADMIN role.",
    }),
    ApiOkResponse({
      description: "Revenue summary",
      type: RevenueResponseDto,
      schema: { example: RevenueResponseExample },
    }),
    UnauthorizedApiResponse,
    ForbiddenApiResponse,
    InternalServerErrorApiResponse
  );
