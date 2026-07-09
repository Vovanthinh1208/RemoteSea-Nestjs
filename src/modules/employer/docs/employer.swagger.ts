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
} from "@/core/swagger/common.responses";
import {
  JOB_STATUS_VALUES,
  APPLICATION_STATUS_VALUES,
} from "@/common/constants/enum-values.constants";
import {
  ApplicationResponseDto,
  CreateEmployerProfileRequestDto,
  CreateEmployerProfileResponseDto,
  EmployerProfileWithStatsResponseDto,
  EmployerProfileDto,
  ListEmployerJobsResponseDto,
  ListJobApplicationsResponseDto,
  UpdateApplicationRequestDto,
  UpdateEmployerProfileRequestDto,
} from "./employer.dto";
import {
  ApplicationResponseExample,
  CreateEmployerProfileRequestExample,
  CreateEmployerProfileResponseExample,
  EmployerProfileResponseExample,
  EmployerProfileWithStatsResponseExample,
  ListEmployerJobsResponseExample,
  ListJobApplicationsResponseExample,
  UpdateApplicationRequestExample,
  UpdateEmployerProfileRequestExample,
} from "./employer.examples";
import {
  ApplicationConflictResponse,
  ApplicationNotFoundResponse,
  EmployerProfileAlreadyExistsResponse,
  EmployerProfileNotFoundResponse,
  EmployerProfileRequiredResponse,
  IllegalTransitionResponse,
  JobNotFoundResponse,
  NotOwningEmployerResponse,
  ValidationErrorResponse,
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
        "Lists paginated applications for a job owned by the caller. Requires the EMPLOYER role (RolesGuard) and ownership is additionally enforced in the service via `job.employer.userId === user.id`, which surfaces as a 403 (not owning) or 404 (job not found).",
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

export const ApiUpdateApplication = () =>
  applyDecorators(
    ApiBearerAuth("bearer"),
    ApiOperation({
      summary: "Update an application's status",
      description:
        "Updates an application's status (and optional notes) under a state machine. Requires the EMPLOYER role (RolesGuard) and ownership is additionally enforced in the service via `application.job.employer.userId === user.id`.\n\n" +
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
