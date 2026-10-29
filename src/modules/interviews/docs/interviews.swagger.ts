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
  CancelInterviewRequestDto,
  ConfirmInterviewRequestDto,
  InterviewResponseDto,
  InterviewWithHeaderResponseDto,
  ProposeInterviewRequestDto,
  UpcomingInterviewsResponseDto,
} from "./interviews.dto";
import {
  ConfirmInterviewRequestExample,
  InterviewExample,
  InterviewWithHeaderExample,
  ProposeInterviewRequestExample,
  UpcomingInterviewsExample,
} from "./interviews.examples";
import {
  ApplicationAccessDeniedResponse,
  ApplicationNotFoundResponse,
  InterviewAlreadyConfirmedResponse,
  InterviewNotConfirmedResponse,
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

export const ApiGetInterviewIcs = () =>
  applyDecorators(
    ApiBearerAuth("bearer"),
    ApiOperation({
      summary: "Download a .ics calendar file for a confirmed interview",
      description:
        "Only available once the interview is CONFIRMED. Returns a raw text/calendar body (not JSON) with a stable per-interview UID, so re-downloading after a reschedule updates the same calendar entry in any RFC 5545-compliant calendar app rather than creating a duplicate.",
    }),
    ApiParam({ name: "id", description: "Application id" }),
    ApiOkResponse({
      description: "RFC 5545 .ics file",
      content: { "text/calendar": { schema: { type: "string" } } },
    }),
    InterviewNotFoundResponse,
    InterviewNotConfirmedResponse,
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

export const ApiListUpcomingInterviews = () =>
  applyDecorators(
    ApiBearerAuth("bearer"),
    ApiOperation({
      summary: "List the company's upcoming confirmed interviews",
      description:
        'Company-wide agenda, not scoped to a single application — every CONFIRMED interview with a confirmedSlot still in the future, sorted soonest-first. Open to any company seat; an INTERVIEWER-role caller gets `scope: "mine"` and only their own assigned interviews back, everyone else gets `scope: "team"` and the full company agenda.',
    }),
    ApiOkResponse({
      description: "The caller's interview agenda",
      type: UpcomingInterviewsResponseDto,
      schema: { example: UpcomingInterviewsExample },
    }),
    UnauthorizedApiResponse,
    ForbiddenApiResponse,
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

export const ApiCancelInterview = () =>
  applyDecorators(
    ApiBearerAuth("bearer"),
    ApiOperation({
      summary: "Cancel a scheduled interview (employer only)",
      description:
        "Cancels a PENDING or CONFIRMED interview. A `reason` is required (PB62) — it is stored on the interview and sent to the talent both in-app and by e-mail. Terminal for this row, but the employer can propose a fresh set of times afterward — that resets it back to PENDING rather than leaving the application permanently unable to schedule.",
    }),
    ApiParam({ name: "id", description: "Application id" }),
    ApiBody({ type: CancelInterviewRequestDto }),
    ApiOkResponse({
      description: "Interview cancelled",
      type: InterviewResponseDto,
      schema: { example: { ...InterviewExample, status: "CANCELLED" } },
    }),
    InterviewNotFoundResponse,
    ApplicationNotFoundResponse,
    ApplicationAccessDeniedResponse,
    UnauthorizedApiResponse,
    ForbiddenApiResponse,
    rateLimitResponse("20/min"),
    InternalServerErrorApiResponse,
  );
