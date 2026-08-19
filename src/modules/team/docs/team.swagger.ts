import { applyDecorators } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import {
  ForbiddenApiResponse,
  InternalServerErrorApiResponse,
  UnauthorizedApiResponse,
} from "@/core/swagger/common.responses";

export const ApiTeamTag = () => applyDecorators(ApiTags("Team"));

export const ApiListMembers = () =>
  applyDecorators(
    ApiBearerAuth("bearer"),
    ApiOperation({
      summary: "List company team members",
      description:
        "Every active seat on the caller's own company — id, role, name, email, joined date. Requires the caller to belong to a company.",
    }),
    UnauthorizedApiResponse,
    ForbiddenApiResponse,
    InternalServerErrorApiResponse,
  );

export const ApiListInvitations = () =>
  applyDecorators(
    ApiBearerAuth("bearer"),
    ApiOperation({
      summary: "List pending team invitations",
      description:
        "OWNER only — invitations sent but not yet accepted or revoked.",
    }),
    UnauthorizedApiResponse,
    ForbiddenApiResponse,
    InternalServerErrorApiResponse,
  );

export const ApiInviteMember = () =>
  applyDecorators(
    ApiBearerAuth("bearer"),
    ApiOperation({
      summary: "Invite a team member",
      description:
        "OWNER only. Sends an email with a 7-day accept link. Rejects a duplicate pending invite to the same address and an email that already belongs to a company member (anywhere).",
    }),
    UnauthorizedApiResponse,
    ForbiddenApiResponse,
    InternalServerErrorApiResponse,
  );

export const ApiRevokeInvitation = () =>
  applyDecorators(
    ApiBearerAuth("bearer"),
    ApiOperation({
      summary: "Revoke a pending invitation",
      description: "OWNER only, and only for their own company's invitation.",
    }),
    UnauthorizedApiResponse,
    ForbiddenApiResponse,
    InternalServerErrorApiResponse,
  );

export const ApiPreviewInvitation = () =>
  applyDecorators(
    ApiOperation({
      summary: "Preview an invitation by token",
      description:
        "Public, unauthenticated — the invited person may not have an account yet. Returns the company name, offered role, and target email so the frontend can guide sign-up/login before accepting.",
    }),
    InternalServerErrorApiResponse,
  );

export const ApiAcceptInvitation = () =>
  applyDecorators(
    ApiBearerAuth("bearer"),
    ApiOperation({
      summary: "Accept a team invitation",
      description:
        "The authenticated caller's own email must match the invitation's — a forwarded link can't be accepted by a different account. Rejects if the caller already belongs to a company.",
    }),
    UnauthorizedApiResponse,
    ForbiddenApiResponse,
    InternalServerErrorApiResponse,
  );

export const ApiUpdateMemberRole = () =>
  applyDecorators(
    ApiBearerAuth("bearer"),
    ApiOperation({
      summary: "Change a team member's role",
      description:
        "OWNER only. Rejects demoting the company's last remaining OWNER.",
    }),
    UnauthorizedApiResponse,
    ForbiddenApiResponse,
    InternalServerErrorApiResponse,
  );

export const ApiRemoveMember = () =>
  applyDecorators(
    ApiBearerAuth("bearer"),
    ApiOperation({
      summary: "Remove a team member",
      description:
        "OWNER only. Rejects removing the company's last remaining OWNER.",
    }),
    UnauthorizedApiResponse,
    ForbiddenApiResponse,
    InternalServerErrorApiResponse,
  );
