import { applyDecorators } from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiBody,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from "@nestjs/swagger";
import {
  InternalServerErrorApiResponse,
  UnauthorizedApiResponse,
  rateLimitResponse,
} from "@/core/swagger/common.responses";
import {
  ApplicationResponseDto,
  ApplicationWithJobResponseDto,
  ApplyRequestDto,
  BacklogDispatchResponseDto,
} from "./applications.dto";
import {
  ApplicationsListExample,
  ApplyRequestExample,
  ApplyResponseExample,
  BacklogDispatchResponseExample,
} from "./applications.examples";
import {
  AlreadyAppliedResponse,
  CronUnauthorizedResponse,
  TalentProfileRequiredResponse,
  ValidationErrorResponse,
} from "./applications.responses";

export const ApiApplicationsTag = () =>
  applyDecorators(ApiTags("Applications"));

export const ApiListApplications = () =>
  applyDecorators(
    ApiBearerAuth("bearer"),
    ApiOperation({
      summary: "List my applications",
      description:
        "Returns the current user's applications (most recent first), each with the embedded job listing. Returns `[]` if the user has no TalentProfile (rather than an error).",
    }),
    ApiOkResponse({
      description: "The current user's applications",
      type: ApplicationWithJobResponseDto,
      isArray: true,
      schema: { example: ApplicationsListExample },
    }),
    UnauthorizedApiResponse,
    InternalServerErrorApiResponse,
  );

export const ApiApply = () =>
  applyDecorators(
    ApiBearerAuth("bearer"),
    ApiOperation({
      summary: "Apply to a job",
      description:
        "Submits a job application as the current user's talent profile; increments the job's applyCount; emails the employer. Requires an existing TalentProfile.",
    }),
    ApiBody({
      type: ApplyRequestDto,
      examples: { default: { value: ApplyRequestExample } },
    }),
    ApiCreatedResponse({
      description: "Application created",
      type: ApplicationResponseDto,
      schema: { example: ApplyResponseExample },
    }),
    ValidationErrorResponse,
    UnauthorizedApiResponse,
    TalentProfileRequiredResponse,
    AlreadyAppliedResponse,
    rateLimitResponse("10 req/60s per user"),
    InternalServerErrorApiResponse,
  );

export const ApiDispatchBacklogReminders = () =>
  applyDecorators(
    ApiOperation({
      summary: "Cron-triggered Employer Response SLA reminder dispatch",
      description:
        "Finds applications stuck past their stage's threshold (PENDING > 3 days unviewed, REVIEWING > 7 days) not reminded within the last 3 days, groups them by employer, and emails each employer one digest. Meant for an external scheduler, not browser clients. " +
        "**Auth**: not JWT — requires the exact header `Authorization: Bearer <CRON_SECRET>`, same as `GET /alerts/cron/dispatch`.",
    }),
    ApiOkResponse({
      description: "Dispatch summary",
      type: BacklogDispatchResponseDto,
      schema: { example: BacklogDispatchResponseExample },
    }),
    CronUnauthorizedResponse,
    InternalServerErrorApiResponse,
  );
