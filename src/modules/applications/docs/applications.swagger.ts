import { applyDecorators } from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiBody,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
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
  ApplicationDetailExample,
  ApplicationsListExample,
  ApplyRequestExample,
  ApplyResponseExample,
  BacklogDispatchResponseExample,
} from "./applications.examples";
import {
  AlreadyAppliedResponse,
  ApplicationNotFoundResponse,
  ApplicationUpdateConflictResponse,
  CronUnauthorizedResponse,
  InvalidStatusTransitionResponse,
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

export const ApiGetApplication = () =>
  applyDecorators(
    ApiBearerAuth("bearer"),
    ApiOperation({
      summary: "Get one of my applications",
      description:
        "Returns a single application (with embedded job and status-event timeline) the caller owns — the target of an APPLICATION_STATUS_CHANGED notification/activity-feed link. Same 404 whether the id doesn't exist or belongs to someone else.",
    }),
    ApiParam({ name: "id", example: "capp1a2b0000ug0h9x1n1a2" }),
    ApiOkResponse({
      description: "The application",
      type: ApplicationWithJobResponseDto,
      schema: { example: ApplicationDetailExample },
    }),
    UnauthorizedApiResponse,
    ApplicationNotFoundResponse,
    InternalServerErrorApiResponse,
  );

export const ApiWithdrawApplication = () =>
  applyDecorators(
    ApiBearerAuth("bearer"),
    ApiOperation({
      summary: "Withdraw my own application",
      description:
        "Talent-initiated withdrawal — only allowed while the application is PENDING, REVIEWING, SHORTLISTED, or INTERVIEW. An extended offer (OFFERED) is handled by PATCH .../offer-response instead. Notifies the employer via the Notification Center.",
    }),
    ApiParam({ name: "id", example: "capp1a2b0000ug0h9x1n1a2" }),
    ApiOkResponse({
      description: "Application withdrawn",
      type: ApplicationWithJobResponseDto,
      schema: { example: { ...ApplicationDetailExample, status: "WITHDRAWN" } },
    }),
    ApplicationNotFoundResponse,
    InvalidStatusTransitionResponse,
    ApplicationUpdateConflictResponse,
    UnauthorizedApiResponse,
    rateLimitResponse("10 req/60s per user"),
    InternalServerErrorApiResponse,
  );

export const ApiRespondToOffer = () =>
  applyDecorators(
    ApiBearerAuth("bearer"),
    ApiOperation({
      summary: "Accept or decline an extended offer",
      description:
        "Only allowed while the application is exactly OFFERED. Sets the application to OFFER_ACCEPTED or OFFER_DECLINED and notifies the employer via the Notification Center.",
    }),
    ApiParam({ name: "id", example: "capp1a2b0000ug0h9x1n1a2" }),
    ApiBody({
      schema: {
        example: { response: "ACCEPTED" },
        properties: { response: { enum: ["ACCEPTED", "DECLINED"] } },
      },
    }),
    ApiOkResponse({
      description: "Offer response recorded",
      type: ApplicationWithJobResponseDto,
      schema: {
        example: { ...ApplicationDetailExample, status: "OFFER_ACCEPTED" },
      },
    }),
    ValidationErrorResponse,
    ApplicationNotFoundResponse,
    InvalidStatusTransitionResponse,
    ApplicationUpdateConflictResponse,
    UnauthorizedApiResponse,
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
