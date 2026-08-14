import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
} from "@nestjs/swagger";
import { ValidationErrorExample } from "./invitations.examples";

/** Reusable, module-specific Swagger response decorators for the Invitations module. */

export const ValidationErrorResponse = ApiBadRequestResponse({
  description: "Zod schema validation failed",
  schema: { example: ValidationErrorExample },
});

export const JobNotActiveResponse = ApiBadRequestResponse({
  description: "The job must be ACTIVE to invite candidates",
  schema: { example: { error: "Job must be active to invite candidates" } },
});

export const JobAccessDeniedResponse = ApiForbiddenResponse({
  description: "The job doesn't belong to the caller's employer profile",
  schema: { example: { error: "You don't own this job" } },
});

export const InvitationAccessDeniedResponse = ApiForbiddenResponse({
  description: "The invitation doesn't belong to the caller",
  schema: { example: { error: "Not your invitation" } },
});

export const InvitationNotFoundResponse = ApiNotFoundResponse({
  description: "No invitation with that id",
  schema: { example: { error: "Invitation not found" } },
});

export const AlreadyInvitedResponse = ApiConflictResponse({
  description: "A duplicate (jobId, talentId) invitation already exists",
  schema: { example: { error: "Already invited" } },
});

export const AlreadyRespondedResponse = ApiConflictResponse({
  description: "The invitation is no longer PENDING",
  schema: { example: { error: "Already responded" } },
});
