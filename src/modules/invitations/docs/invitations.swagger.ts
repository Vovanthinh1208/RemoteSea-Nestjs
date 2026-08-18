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
  InvitationResponseDto,
  RespondInvitationRequestDto,
  RespondInvitationResponseDto,
  SendInvitationRequestDto,
} from "./invitations.dto";
import {
  InvitationExample,
  InvitationsListExample,
  RespondInvitationResponseExample,
  SendInvitationRequestExample,
} from "./invitations.examples";
import {
  AlreadyInvitedResponse,
  AlreadyRespondedResponse,
  InvitationAccessDeniedResponse,
  InvitationNotFoundResponse,
  JobAccessDeniedResponse,
  JobNotActiveResponse,
  ValidationErrorResponse,
} from "./invitations.responses";

export const ApiInvitationsTag = () => applyDecorators(ApiTags("Invitations"));

export const ApiSendInvitation = () =>
  applyDecorators(
    ApiBearerAuth("bearer"),
    ApiOperation({
      summary: "Invite a candidate to apply (employer only)",
      description:
        "Sends an invitation for one of the caller's own ACTIVE jobs to a candidate (found via Talent Search). Sends a notification email unless the talent has turned off NotificationPreference.employerMessages — the invitation itself is always visible in-app either way. Accepting it (PATCH /invitations/:id) creates a real Application, indistinguishable afterward from one the candidate submitted themselves.",
    }),
    ApiBody({
      type: SendInvitationRequestDto,
      examples: { default: { value: SendInvitationRequestExample } },
    }),
    ApiCreatedResponse({
      description: "Invitation created",
      type: InvitationResponseDto,
      schema: { example: InvitationExample },
    }),
    ValidationErrorResponse,
    JobNotActiveResponse,
    JobAccessDeniedResponse,
    AlreadyInvitedResponse,
    UnauthorizedApiResponse,
    ForbiddenApiResponse,
    rateLimitResponse("20/hour"),
    InternalServerErrorApiResponse,
  );

export const ApiListInvitations = () =>
  applyDecorators(
    ApiBearerAuth("bearer"),
    ApiOperation({
      summary: "List my invitations",
      description:
        "Returns the current user's received invitations (most recent first). Returns `[]` if the user has no TalentProfile, rather than an error.",
    }),
    ApiOkResponse({
      description: "The caller's invitations",
      type: [InvitationResponseDto],
      schema: { example: InvitationsListExample },
    }),
    UnauthorizedApiResponse,
    InternalServerErrorApiResponse,
  );

export const ApiRespondInvitation = () =>
  applyDecorators(
    ApiBearerAuth("bearer"),
    ApiOperation({
      summary: "Accept or decline an invitation",
      description:
        "Only the invited talent may respond, and only while the invitation is still PENDING. Accepting creates a real Application (same path as a self-initiated apply) and notifies the employer; declining just marks the invitation DECLINED.",
    }),
    ApiParam({ name: "id", type: String, example: "cinv1a2b0000ug0h9x1n1a2" }),
    ApiBody({ type: RespondInvitationRequestDto }),
    ApiOkResponse({
      description: "The invitation's new status",
      type: RespondInvitationResponseDto,
      schema: { example: RespondInvitationResponseExample },
    }),
    ValidationErrorResponse,
    InvitationNotFoundResponse,
    InvitationAccessDeniedResponse,
    AlreadyRespondedResponse,
    UnauthorizedApiResponse,
    InternalServerErrorApiResponse,
  );
