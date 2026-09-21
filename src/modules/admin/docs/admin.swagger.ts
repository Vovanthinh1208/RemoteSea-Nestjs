import { applyDecorators } from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiBody,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
} from "@nestjs/swagger";
import {
  ForbiddenApiResponse,
  InternalServerErrorApiResponse,
  UnauthorizedApiResponse,
  rateLimitResponse,
} from "@/core/swagger/common.responses";
import {
  ADMIN_AUDIT_TARGET_TYPE_VALUES,
  JOB_REPORT_STATUS_VALUES,
  JOB_STATUS_VALUES,
  USER_ROLE_VALUES,
} from "@/common/constants/enum-values.constants";
import {
  ListAuditLogResponseDto,
  ListEmployersResponseDto,
  ListJobsResponseDto,
  ListReportsResponseDto,
  JobModerationFlagResponseDto,
  ResolveReportRequestDto,
  ResolveReportResponseDto,
  ReviewJobRequestDto,
  ReviewJobResponseDto,
  RevenueResponseDto,
  UpdateEmployerRequestDto,
  UpdateEmployerResponseDto,
} from "./admin.dto";
import {
  ListAuditLogResponseExample,
  ListEmployersResponseExample,
  ListJobsResponseExample,
  ListReportsResponseExample,
  ResolveReportRequestExample,
  ResolveReportResponseExample,
  ReviewJobApprovedResponseExample,
  ReviewJobRequestApproveExample,
  ReviewJobRequestRejectExample,
  RevenueResponseExample,
  UpdateEmployerRequestExample,
  UpdateEmployerResponseExample,
} from "./admin.examples";
import {
  EmployerNotFoundResponse,
  JobModerationUnavailableResponse,
  JobNotFoundResponse,
  ReportAlreadyResolvedResponse,
  ReportNotFoundResponse,
  UserNotFoundResponse,
  ValidationErrorResponse,
} from "./admin.responses";

export const ApiAdminTag = () =>
  applyDecorators(ApiTags("Admin"), ApiBearerAuth("bearer"));

export const ApiListEmployers = () =>
  applyDecorators(
    ApiOperation({
      summary: "List employers for moderation",
      description:
        "Lists employer profiles for moderation with computed job count and total ad spend, paginated. Requires ADMIN role.",
    }),
    ApiQuery({
      name: "verified",
      required: false,
      enum: ["true", "false"],
      description: "Filters on EmployerProfile.isVerified",
    }),
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
    InternalServerErrorApiResponse,
  );

export const ApiUpdateEmployer = () =>
  applyDecorators(
    ApiOperation({
      summary: "Verify or suspend an employer",
      description:
        "Verifies or suspends an employer. Suspending force-closes (status: CLOSED) all of that employer's ACTIVE jobs, transactionally. Requires ADMIN role.",
    }),
    ApiParam({ name: "id", description: "EmployerProfile id" }),
    ApiBody({
      type: UpdateEmployerRequestDto,
      examples: { default: { value: UpdateEmployerRequestExample } },
    }),
    ApiOkResponse({
      description: "Employer updated",
      type: UpdateEmployerResponseDto,
      schema: { example: UpdateEmployerResponseExample },
    }),
    ValidationErrorResponse,
    UnauthorizedApiResponse,
    ForbiddenApiResponse,
    EmployerNotFoundResponse,
    InternalServerErrorApiResponse,
  );

export const ApiListJobs = () =>
  applyDecorators(
    ApiOperation({
      summary: "List jobs for moderation",
      description:
        "Lists jobs for moderation review, filtered by status, paginated, oldest first (FIFO review queue). Requires ADMIN role.",
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
      description:
        "Paginated job list with partial `employer` and `categories` (no `skills` include)",
      type: ListJobsResponseDto,
      schema: { example: ListJobsResponseExample },
    }),
    ValidationErrorResponse,
    UnauthorizedApiResponse,
    ForbiddenApiResponse,
    InternalServerErrorApiResponse,
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
      description:
        "Job reviewed — partial Job object (`status` and `publishedAt` only)",
      type: ReviewJobResponseDto,
      schema: { example: ReviewJobApprovedResponseExample },
    }),
    ValidationErrorResponse,
    UnauthorizedApiResponse,
    ForbiddenApiResponse,
    JobNotFoundResponse,
    InternalServerErrorApiResponse,
  );

export const ApiGetJobModerationFlag = () =>
  applyDecorators(
    ApiBearerAuth("bearer"),
    ApiOperation({
      summary:
        "Get (or lazily generate) an AI scam/quality risk flag for a job",
      description:
        "Advisory only — this never gates approve/reject, a human admin always makes that call; it's a signal the queue UI can surface alongside the automated checks. Cached 1:1 per job — the first call for a given job calls the LLM (a few seconds); every call after returns the cached row instantly. Requires ADMIN role.",
    }),
    ApiParam({ name: "id", description: "Job id" }),
    ApiOkResponse({
      description: "The (possibly freshly generated) risk flag",
      type: JobModerationFlagResponseDto,
    }),
    JobModerationUnavailableResponse,
    JobNotFoundResponse,
    UnauthorizedApiResponse,
    ForbiddenApiResponse,
    rateLimitResponse("20 req/60s per admin"),
    InternalServerErrorApiResponse,
  );

export const ApiRegenerateJobModerationFlag = () =>
  applyDecorators(
    ApiBearerAuth("bearer"),
    ApiOperation({
      summary: "Regenerate the AI scam/quality risk flag for a job",
      description:
        "Unlike the GET above, always calls the LLM and overwrites the cached row — for a job that was edited and resubmitted, or a flag an admin wants a second opinion on. Shares the same per-admin rate-limit budget as the GET endpoint. Advisory only, same as the GET endpoint.",
    }),
    ApiParam({ name: "id", description: "Job id" }),
    ApiOkResponse({
      description: "The freshly regenerated risk flag",
      type: JobModerationFlagResponseDto,
    }),
    JobModerationUnavailableResponse,
    JobNotFoundResponse,
    UnauthorizedApiResponse,
    ForbiddenApiResponse,
    rateLimitResponse("20 req/60s per admin"),
    InternalServerErrorApiResponse,
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
    InternalServerErrorApiResponse,
  );

export const ApiListReports = () =>
  applyDecorators(
    ApiOperation({
      summary: "List job reports for moderation",
      description:
        "Lists talent/employer-filed job reports, filtered by status (defaults to OPEN), paginated, newest first. Requires ADMIN role.",
    }),
    ApiQuery({
      name: "status",
      required: false,
      enum: JOB_REPORT_STATUS_VALUES,
      description: "Defaults to OPEN",
    }),
    ApiQuery({ name: "page", required: false, type: Number, example: 1 }),
    ApiQuery({ name: "limit", required: false, type: Number, example: 20 }),
    ApiOkResponse({
      description: "Paginated report list",
      type: ListReportsResponseDto,
      schema: { example: ListReportsResponseExample },
    }),
    ValidationErrorResponse,
    UnauthorizedApiResponse,
    ForbiddenApiResponse,
    InternalServerErrorApiResponse,
  );

export const ApiResolveReport = () =>
  applyDecorators(
    ApiOperation({
      summary: "Resolve or dismiss a job report",
      description:
        "Marks an OPEN report RESOLVED or DISMISSED. Does not touch the reported Job's own status — resolving a report is a separate action from approving/rejecting the listing itself. No email notifications (neither the reporter nor the employer is told). Requires ADMIN role.",
    }),
    ApiParam({ name: "id", description: "JobReport id" }),
    ApiBody({
      type: ResolveReportRequestDto,
      examples: { default: { value: ResolveReportRequestExample } },
    }),
    ApiOkResponse({
      description: "Report resolved",
      type: ResolveReportResponseDto,
      schema: { example: ResolveReportResponseExample },
    }),
    ValidationErrorResponse,
    UnauthorizedApiResponse,
    ForbiddenApiResponse,
    ReportNotFoundResponse,
    ReportAlreadyResolvedResponse,
    InternalServerErrorApiResponse,
  );

export const ApiListUsers = () =>
  applyDecorators(
    ApiOperation({
      summary: "List users for moderation",
      description:
        "Lists platform users (any role), filterable by role/banned status, searchable by email/name substring, paginated. Requires ADMIN role.",
    }),
    ApiQuery({ name: "role", required: false, enum: USER_ROLE_VALUES }),
    ApiQuery({
      name: "banned",
      required: false,
      enum: ["true", "false"],
      description: "Filters on User.bannedAt",
    }),
    ApiQuery({
      name: "q",
      required: false,
      type: String,
      description: "Case-insensitive substring match on email or name",
    }),
    ApiQuery({ name: "page", required: false, type: Number, example: 1 }),
    ApiQuery({ name: "limit", required: false, type: Number, example: 20 }),
    ApiOkResponse({
      description: "Paginated user list",
      schema: {
        example: {
          users: [
            {
              id: "clx1",
              email: "talent@example.com",
              name: "Jane Doe",
              role: "TALENT",
              bannedAt: null,
              createdAt: "2026-01-01T00:00:00.000Z",
            },
          ],
          pagination: { page: 1, limit: 20, total: 1, pages: 1 },
        },
      },
    }),
    ValidationErrorResponse,
    UnauthorizedApiResponse,
    ForbiddenApiResponse,
    InternalServerErrorApiResponse,
  );

export const ApiUpdateUser = () =>
  applyDecorators(
    ApiOperation({
      summary: "Ban, unban, or change the role of a user",
      description:
        "Banning blocks sign-in immediately (AuthService.validateCredentials) and, like a role change, revokes every one of that user's active sessions — closing the stale-privilege window a JWT's baked-in role would otherwise leave open until it expires. Unbanning does not force a re-login. An admin cannot act on their own account. Requires ADMIN role.",
    }),
    ApiParam({ name: "id", description: "User id" }),
    ApiBody({
      schema: {
        example: { action: "ban" },
      },
    }),
    ApiOkResponse({
      description: "User updated",
      schema: { example: { success: true } },
    }),
    ValidationErrorResponse,
    UnauthorizedApiResponse,
    ForbiddenApiResponse,
    UserNotFoundResponse,
    InternalServerErrorApiResponse,
  );

export const ApiListAuditLog = () =>
  applyDecorators(
    ApiOperation({
      summary: "List admin moderation actions",
      description:
        "Newest-first, paginated record of every employer verify/suspend, job approve/reject, and report resolve/dismiss — who, what, when, and the before/after state. Filter by targetType+targetId to see the full history for one employer/job/report. Requires ADMIN role.",
    }),
    ApiQuery({
      name: "targetType",
      required: false,
      enum: ADMIN_AUDIT_TARGET_TYPE_VALUES,
    }),
    ApiQuery({
      name: "targetId",
      required: false,
      type: String,
      description: "Only meaningful alongside targetType",
    }),
    ApiQuery({ name: "page", required: false, type: Number, example: 1 }),
    ApiQuery({ name: "limit", required: false, type: Number, example: 20 }),
    ApiOkResponse({
      description: "Paginated audit log, newest first",
      type: ListAuditLogResponseDto,
      schema: { example: ListAuditLogResponseExample },
    }),
    ValidationErrorResponse,
    UnauthorizedApiResponse,
    ForbiddenApiResponse,
    InternalServerErrorApiResponse,
  );
