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
  ForbiddenApiResponse,
  InternalServerErrorApiResponse,
  UnauthorizedApiResponse,
  rateLimitResponse,
} from "@/core/swagger/common.responses";
import {
  ConfirmInterviewRequestDto,
  InterviewResponseDto,
  InterviewWithHeaderResponseDto,
  ProposeInterviewRequestDto,
} from "./interviews.dto";
import {
  ConfirmInterviewRequestExample,
  InterviewExample,
  InterviewWithHeaderExample,
  ProposeInterviewRequestExample,
} from "./interviews.examples";
import {
  ApplicationAccessDeniedResponse,
  ApplicationNotFoundResponse,
  InterviewAlreadyConfirmedResponse,
  InterviewNotFoundResponse,
  InvalidSlotResponse,
  NotAtInterviewStageResponse,
  ValidationErrorResponse,
} from "./interviews.responses";

export const ApiInterviewsTag = () => applyDecorators(ApiTags("Interviews"));

export const ApiGetInterview = () =>
  applyDecorators(
    ApiBearerAuth("bearer"),
    ApiOperation({
      summary: "Get the interview scheduled for an application",
      description:
        "Only the application's talent or its job's employer may call this. `interview` is null if nothing has been proposed yet. Bundled with header context (job title, both parties' display names), same shape as GET .../messages.",
    }),
    ApiParam({ name: "id", description: "Application id" }),
    ApiOkResponse({
      description: "The interview (if any) plus header context",
      type: InterviewWithHeaderResponseDto,
      schema: { example: InterviewWithHeaderExample },
    }),
    ApplicationNotFoundResponse,
    ApplicationAccessDeniedResponse,
    UnauthorizedApiResponse,
    ForbiddenApiResponse,
    InternalServerErrorApiResponse,
  );

export const ApiProposeInterview = () =>
  applyDecorators(
    ApiBearerAuth("bearer"),
    ApiOperation({
      summary: "Propose interview times (employer only)",
      description:
        "Requires the application to already be at the INTERVIEW stage. Calling this again while the interview is still PENDING revises the proposed times (upsert) — once the talent confirms, the interview is locked and this returns 409. Notifies the talent via the Notification Center.",
    }),
    ApiParam({ name: "id", description: "Application id" }),
    ApiBody({
      type: ProposeInterviewRequestDto,
      examples: { default: { value: ProposeInterviewRequestExample } },
    }),
    ApiCreatedResponse({
      description: "Interview proposed (or revised)",
      type: InterviewResponseDto,
      schema: { example: InterviewExample },
    }),
    ValidationErrorResponse,
    NotAtInterviewStageResponse,
    InvalidSlotResponse,
    InterviewAlreadyConfirmedResponse,
    ApplicationNotFoundResponse,
    ApplicationAccessDeniedResponse,
    UnauthorizedApiResponse,
    ForbiddenApiResponse,
    rateLimitResponse("20/min"),
    InternalServerErrorApiResponse,
  );

export const ApiConfirmInterview = () =>
  applyDecorators(
    ApiBearerAuth("bearer"),
    ApiOperation({
      summary: "Confirm one of the proposed interview slots (talent only)",
      description:
        "`slot` must exactly match one of the interview's proposedSlots. Locks the interview as CONFIRMED and notifies the employer via the Notification Center.",
    }),
    ApiParam({ name: "id", description: "Application id" }),
    ApiBody({
      type: ConfirmInterviewRequestDto,
      examples: { default: { value: ConfirmInterviewRequestExample } },
    }),
    ApiOkResponse({
      description: "Interview confirmed",
      type: InterviewResponseDto,
      schema: {
        example: {
          ...InterviewExample,
          status: "CONFIRMED",
          confirmedSlot: "2026-08-25T07:00:00.000Z",
        },
      },
    }),
    ValidationErrorResponse,
    InvalidSlotResponse,
    InterviewNotFoundResponse,
    InterviewAlreadyConfirmedResponse,
    ApplicationNotFoundResponse,
    ApplicationAccessDeniedResponse,
    UnauthorizedApiResponse,
    ForbiddenApiResponse,
    rateLimitResponse("20/min"),
    InternalServerErrorApiResponse,
  );
