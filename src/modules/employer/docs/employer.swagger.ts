import { applyDecorators } from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiBody,
  ApiCreatedResponse,
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
  JOB_STATUS_VALUES,
  APPLICATION_STATUS_VALUES,
} from "@/common/constants/enum-values.constants";
import {
  ApplicationResponseDto,
  BulkUpdateApplicationsRequestDto,
  BulkUpdateApplicationsResponseDto,
  ConfirmVerificationRequestDto,
  CreateEmployerProfileRequestDto,
  CreateEmployerProfileResponseDto,
  EmployerDashboardResponseDto,
  EmployerProfileWithStatsResponseDto,
  EmployerProfileDto,
  ListEmployerJobsResponseDto,
  ListJobApplicationsResponseDto,
  ListRecentApplicationsResponseDto,
  MessageResponseDto,
  PublicCompanyProfileDto,
  SubmitVerificationRequestDto,
  UpdateApplicationRequestDto,
  UpdateEmployerProfileRequestDto,
} from "./employer.dto";
import {
  ApplicationResponseExample,
  BulkUpdateApplicationsRequestExample,
  BulkUpdateApplicationsResponseExample,
  ConfirmVerificationRequestExample,
  ConfirmVerificationResponseExample,
  CreateEmployerProfileRequestExample,
  CreateEmployerProfileResponseExample,
  EmployerDashboardResponseExample,
  EmployerProfileResponseExample,
  EmployerProfileWithStatsResponseExample,
  ListEmployerJobsResponseExample,
  ListJobApplicationsResponseExample,
  PublicCompanyProfileResponseExample,
  SubmitVerificationRequestExample,
  SubmitVerificationResponseExample,
  UpdateApplicationRequestExample,
  UpdateEmployerProfileRequestExample,
} from "./employer.examples";
import {
  ApplicationConflictResponse,
  ApplicationNotFoundResponse,
  CompanyNotFoundResponse,
  EmployerProfileAlreadyExistsResponse,
  EmployerProfileNotFoundResponse,
  EmployerProfileRequiredResponse,
  IllegalTransitionResponse,
  InvalidOrExpiredVerificationTokenResponse,
  JobNotFoundResponse,
  NotOwningEmployerResponse,
  ValidationErrorResponse,
  VerificationRejectedResponse,
} from "./employer.responses";

export const ApiEmployerTag = () => applyDecorators(ApiTags("Employer"));

export const ApiCreateEmployerProfile = () =>
  applyDecorators(
    ApiBearerAuth("bearer"),
    ApiOperation({
      summary: "Create an employer profile",
      description:
        "Creates an EmployerProfile for the authenticated user and promotes their User.role to EMPLOYER. Slug collisions get a random 6-char suffix. Any authenticated role may call this.",
    }),
    ApiBody({
      type: CreateEmployerProfileRequestDto,
      examples: { default: { value: CreateEmployerProfileRequestExample } },
    }),
    ApiCreatedResponse({
      description: "Employer profile created",
      type: CreateEmployerProfileResponseDto,
      schema: { example: CreateEmployerProfileResponseExample },
    }),
    ValidationErrorResponse,
    UnauthorizedApiResponse,
    EmployerProfileAlreadyExistsResponse,
    InternalServerErrorApiResponse,
  );

export const ApiGetEmployerProfile = () =>
  applyDecorators(
    ApiBearerAuth("bearer"),
    ApiOperation({
      summary: "Get the authenticated employer's profile",
      description:
        "Returns the authenticated employer's profile plus `_count.jobs` and a computed `totalApplications`. Requires the EMPLOYER role (RolesGuard).",
    }),
    ApiOkResponse({
      description: "Employer profile with stats",
      type: EmployerProfileWithStatsResponseDto,
      schema: { example: EmployerProfileWithStatsResponseExample },
    }),
    UnauthorizedApiResponse,
    ForbiddenApiResponse,
    EmployerProfileNotFoundResponse,
    InternalServerErrorApiResponse,
  );

export const ApiUpdateEmployerProfile = () =>
  applyDecorators(
    ApiBearerAuth("bearer"),
    ApiOperation({
      summary: "Update the authenticated employer's profile",
      description:
        "Updates fields on the authenticated employer's profile. All fields optional. Requires the EMPLOYER role (RolesGuard).",
    }),
    ApiBody({
      type: UpdateEmployerProfileRequestDto,
      examples: { default: { value: UpdateEmployerProfileRequestExample } },
    }),
    ApiOkResponse({
      description: "Updated employer profile",
      type: EmployerProfileDto,
      schema: { example: EmployerProfileResponseExample },
    }),
    ValidationErrorResponse,
    UnauthorizedApiResponse,
    ForbiddenApiResponse,
    EmployerProfileNotFoundResponse,
    InternalServerErrorApiResponse,
  );

export const ApiListEmployerJobs = () =>
  applyDecorators(
    ApiBearerAuth("bearer"),
    ApiOperation({
      summary: "List the authenticated employer's jobs",
      description:
        "Lists jobs owned by the authenticated employer, optionally filtered by status, plus aggregate hiring stats. `avgTimeToHireInDays` is computed only over OFFERED applications (0 if none). Requires the EMPLOYER role (RolesGuard) and an existing EmployerProfile.",
    }),
    ApiQuery({
      name: "status",
      required: false,
      enum: JOB_STATUS_VALUES,
      description: "Filter jobs by status",
    }),
    ApiOkResponse({
      description: "Jobs and hiring stats",
      type: ListEmployerJobsResponseDto,
      schema: { example: ListEmployerJobsResponseExample },
    }),
    ValidationErrorResponse,
    UnauthorizedApiResponse,
    ForbiddenApiResponse,
    EmployerProfileRequiredResponse,
    InternalServerErrorApiResponse,
  );

export const ApiListJobApplications = () =>
  applyDecorators(
    ApiBearerAuth("bearer"),
    ApiOperation({
      summary: "List applications for a job",
      description:
        "Lists paginated applications for a job belonging to the caller's company. Requires the EMPLOYER role (RolesGuard); company membership and role (OWNER/RECRUITER/HIRING_MANAGER) are enforced by EmployerJobOwnershipGuard, which surfaces as a 403 (wrong company/role) or 404 (job not found).",
    }),
    ApiParam({
      name: "id",
      description: "Job id",
      example: "cljob1a2b3c4d5e6f7g8h9i0",
    }),
    ApiQuery({
      name: "status",
      required: false,
      enum: APPLICATION_STATUS_VALUES,
      description: "Filter applications by status",
    }),
    ApiQuery({ name: "page", required: false, type: Number, example: 1 }),
    ApiQuery({ name: "limit", required: false, type: Number, example: 20 }),
    ApiOkResponse({
      description: "Paginated applications",
      type: ListJobApplicationsResponseDto,
      schema: { example: ListJobApplicationsResponseExample },
    }),
    ValidationErrorResponse,
    UnauthorizedApiResponse,
    NotOwningEmployerResponse,
    JobNotFoundResponse,
    InternalServerErrorApiResponse,
  );

export const ApiExportJobApplicants = () =>
  applyDecorators(
    ApiBearerAuth("bearer"),
    ApiOperation({
      summary: "Export applicants for a job as CSV",
      description:
        "Same underlying select and status filter as GET .../applications, just unpaginated — exports every matching applicant, capped at 5000 rows. Returns a raw text/csv body (not JSON), UTF-8 BOM prefixed for Excel, RFC 4180 quoted, CRLF line endings, as attachment 'applicants-YYYY-MM-DD.csv'. Requires the EMPLOYER role; company membership and role are enforced by EmployerJobOwnershipGuard, same as the list endpoint.",
    }),
    ApiParam({
      name: "id",
      description: "Job id",
      example: "cljob1a2b3c4d5e6f7g8h9i0",
    }),
    ApiQuery({
      name: "status",
      required: false,
      enum: APPLICATION_STATUS_VALUES,
      description: "Export only applications in this status",
    }),
    ApiOkResponse({
      description: "RFC 4180 CSV file",
      content: { "text/csv": { schema: { type: "string" } } },
    }),
    ValidationErrorResponse,
    UnauthorizedApiResponse,
    NotOwningEmployerResponse,
    JobNotFoundResponse,
    rateLimitResponse("10 req/60s per employer"),
    InternalServerErrorApiResponse,
  );

export const ApiListRecentApplications = () =>
  applyDecorators(
    ApiBearerAuth("bearer"),
    ApiOperation({
      summary: "List the company's most recent applications, across jobs",
      description:
        "Company-wide activity feed for the dashboard's 'Recent applicants' panel — the most recent applications across every job in the caller's company, newest first, capped server-side (not paginated). Requires the EMPLOYER role; company membership and role (OWNER/RECRUITER/HIRING_MANAGER) are resolved from the caller's own membership, same as GET /employer/jobs.",
    }),
    ApiOkResponse({
      description: "The company's most recent applications",
      type: ListRecentApplicationsResponseDto,
    }),
    UnauthorizedApiResponse,
    ForbiddenApiResponse,
    InternalServerErrorApiResponse,
  );

export const ApiGetHiringFunnel = () =>
  applyDecorators(
    ApiBearerAuth("bearer"),
    ApiOperation({
      summary: "Hiring funnel dashboard chart",
      description:
        "Aggregates every ApplicationStatusEvent across the caller's company into pipeline-stage counts (Applied → Reviewing → Shortlisted → Interview → Offered → Hired) with conversion rates, plus a separate rejected/withdrawn/offer-declined drop-off breakdown. Each stage counts DISTINCT applications that ever reached it at least once — not a live snapshot of Application.status — so an application moved back a stage isn't double-counted. Requires the EMPLOYER role; company membership and role are resolved the same way as GET /employer/applications/recent.",
    }),
    ApiOkResponse({
      description: "Funnel stages and drop-off counts",
      schema: {
        example: {
          stages: [
            {
              status: "PENDING",
              label: "Applied",
              count: 120,
              conversionFromFirst: 100,
              conversionFromPrevious: 100,
            },
            {
              status: "OFFER_ACCEPTED",
              label: "Hired",
              count: 6,
              conversionFromFirst: 5,
              conversionFromPrevious: 60,
            },
          ],
          dropOff: [{ status: "REJECTED", label: "Rejected", count: 80 }],
        },
      },
    }),
    UnauthorizedApiResponse,
    ForbiddenApiResponse,
    InternalServerErrorApiResponse,
  );

export const ApiGetEmployerDashboard = () =>
  applyDecorators(
    ApiBearerAuth("bearer"),
    ApiOperation({
      summary: "Employer dashboard, in one request",
      description:
        "Combines GET /employer/profile, /jobs, /applications/recent, and /analytics/funnel into a single response — the frontend's dashboard screen used to fire all four as separate requests, each independently 403/404-ing the same 'no company yet' way. Each field is resolved (and can come back null) independently, mirroring exactly what its standalone endpoint already does — see EmployerDashboardResponseDto. Never returns a 403/404 itself for the no-company case; only for a caller who isn't authenticated or isn't EMPLOYER at all.",
    }),
    ApiOkResponse({
      description: "Dashboard data — any field may be null",
      type: EmployerDashboardResponseDto,
      schema: { example: EmployerDashboardResponseExample },
    }),
    UnauthorizedApiResponse,
    ForbiddenApiResponse,
    InternalServerErrorApiResponse,
  );

export const ApiBulkUpdateApplications = () =>
  applyDecorators(
    ApiBearerAuth("bearer"),
    ApiOperation({
      summary: "Update the status of multiple applications at once",
      description:
        "Applies one target status to a batch of the caller's own applications (up to 50 ids), e.g. bulk-rejecting a pile of candidates. Partial success by design — one stale or invalid item never blocks the rest of the batch. Each id independently goes through the same ALLOWED_TRANSITIONS check and ownership check as PATCH /employer/applications/:id; failures are reported per id in the response instead of failing the whole call. An id that doesn't exist or belongs to a different employer's job reports NOT_FOUND (not 403) — same 'don't confirm another employer's application exists' reasoning as the single-item route. `notes`, if given, overwrites every application in the batch with the same shared text (there's no per-item note in a bulk request).",
    }),
    ApiBody({
      type: BulkUpdateApplicationsRequestDto,
      examples: { default: { value: BulkUpdateApplicationsRequestExample } },
    }),
    ApiOkResponse({
      description: "Per-id result of the batch",
      type: BulkUpdateApplicationsResponseDto,
      schema: { example: BulkUpdateApplicationsResponseExample },
    }),
    ValidationErrorResponse,
    UnauthorizedApiResponse,
    ForbiddenApiResponse,
    rateLimitResponse("10/minute"),
    InternalServerErrorApiResponse,
  );

export const ApiUpdateApplication = () =>
  applyDecorators(
    ApiBearerAuth("bearer"),
    ApiOperation({
      summary: "Update an application's status",
      description:
        "Updates an application's status (and optional notes) under a state machine. Requires the EMPLOYER role (RolesGuard); company membership and role (OWNER/RECRUITER/HIRING_MANAGER) are enforced by ApplicationOwnershipGuard.\n\n" +
        "Allowed transitions (ALLOWED_TRANSITIONS):\n" +
        "- PENDING → REVIEWING | REJECTED\n" +
        "- REVIEWING → SHORTLISTED | REJECTED\n" +
        "- SHORTLISTED → INTERVIEW | REJECTED\n" +
        "- INTERVIEW → OFFERED | REJECTED\n" +
        "- OFFERED → REJECTED\n" +
        "- REJECTED → (none)\n" +
        "- WITHDRAWN → (none)\n\n" +
        "Setting the same status the application already has is always a no-op allowed, regardless of the table above.",
    }),
    ApiParam({
      name: "id",
      description: "Application id",
      example: "clapp1a2b3c4d5e6f7g8h9i0",
    }),
    ApiBody({
      type: UpdateApplicationRequestDto,
      examples: { default: { value: UpdateApplicationRequestExample } },
    }),
    ApiOkResponse({
      description: "Updated application",
      type: ApplicationResponseDto,
      schema: { example: ApplicationResponseExample },
    }),
    IllegalTransitionResponse,
    UnauthorizedApiResponse,
    NotOwningEmployerResponse,
    ApplicationNotFoundResponse,
    ApplicationConflictResponse,
    InternalServerErrorApiResponse,
  );

export const ApiSubmitVerification = () =>
  applyDecorators(
    ApiBearerAuth("bearer"),
    ApiOperation({
      summary: "Submit company email verification",
      description:
        "Emails a 6-digit verification code (valid 15 minutes) to the given address if its domain matches the company's websiteUrl. OWNER only; a websiteUrl must already be on file. Resubmitting invalidates any earlier unused code for this company.",
    }),
    ApiBody({
      type: SubmitVerificationRequestDto,
      examples: { default: { value: SubmitVerificationRequestExample } },
    }),
    ApiOkResponse({
      description: "Verification email sent",
      type: MessageResponseDto,
      schema: { example: SubmitVerificationResponseExample },
    }),
    ValidationErrorResponse,
    UnauthorizedApiResponse,
    ForbiddenApiResponse,
    EmployerProfileNotFoundResponse,
    VerificationRejectedResponse,
    rateLimitResponse("5 req/60s per employer"),
    InternalServerErrorApiResponse,
  );

export const ApiVerifyCode = () =>
  applyDecorators(
    ApiBearerAuth("bearer"),
    ApiOperation({
      summary: "Verify the company with the emailed code",
      description:
        "OWNER enters the 6-digit code from POST /employer/verification. A match within 15 minutes sets verificationStatus = VERIFIED and isVerified = true. 5 wrong entries burn the code (a new one must be requested).",
    }),
    ApiBody({
      schema: {
        type: "object",
        required: ["code"],
        properties: { code: { type: "string", example: "482913" } },
      },
    }),
    ApiOkResponse({
      description: "Company email verified",
      type: MessageResponseDto,
      schema: { example: ConfirmVerificationResponseExample },
    }),
    ValidationErrorResponse,
    UnauthorizedApiResponse,
    ForbiddenApiResponse,
    InvalidOrExpiredVerificationTokenResponse,
    rateLimitResponse("10 req/60s per user"),
    InternalServerErrorApiResponse,
  );

export const ApiConfirmVerification = () =>
  applyDecorators(
    ApiOperation({
      summary: "Confirm company email verification",
      description:
        "Legacy: consumes a link token from a verification email sent before the OTP flow (POST /employer/verification/verify-code). Unauthenticated — the token itself is the proof.",
    }),
    ApiBody({
      type: ConfirmVerificationRequestDto,
      examples: { default: { value: ConfirmVerificationRequestExample } },
    }),
    ApiOkResponse({
      description: "Company email verified",
      type: MessageResponseDto,
      schema: { example: ConfirmVerificationResponseExample },
    }),
    ValidationErrorResponse,
    InvalidOrExpiredVerificationTokenResponse,
    InternalServerErrorApiResponse,
  );

export const ApiCompaniesTag = () => applyDecorators(ApiTags("Companies"));

export const ApiGetCompanyProfile = () =>
  applyDecorators(
    ApiOperation({
      summary: "Get a company's public profile",
      description:
        "Fetches a company's public profile by slug — company info, active job count, cumulative vnHireTotal, the same sample-gated avgFirstResponseHours as GET /jobs/:id, and up to 50 currently ACTIVE jobs. No authentication required, no visibility gate (every company profile is public).",
    }),
    ApiParam({
      name: "slug",
      description: "EmployerProfile slug",
      example: "remotesea-ltd",
    }),
    ApiOkResponse({
      description: "Company profile",
      type: PublicCompanyProfileDto,
      schema: { example: PublicCompanyProfileResponseExample },
    }),
    CompanyNotFoundResponse,
    InternalServerErrorApiResponse,
  );
