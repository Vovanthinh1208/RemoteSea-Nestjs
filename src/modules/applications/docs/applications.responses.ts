import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiUnauthorizedResponse,
} from "@nestjs/swagger";
import { ValidationErrorExample } from "./applications.examples";

/** Reusable, module-specific Swagger response decorators for the Applications module. */

export const ValidationErrorResponse = ApiBadRequestResponse({
  description: "Zod schema validation failed",
  schema: { example: ValidationErrorExample },
});

export const TalentProfileRequiredResponse = ApiForbiddenResponse({
  description: "The authenticated user has no TalentProfile",
  schema: { example: { error: "Talent profile required" } },
});

export const AlreadyAppliedResponse = ApiConflictResponse({
  description: "A duplicate (jobId, talentId) application already exists",
  schema: { example: { error: "Already applied" } },
});

export const ApplicationNotFoundResponse = ApiNotFoundResponse({
  description:
    "No application with this id belongs to the caller (same response whether it doesn't exist or belongs to someone else)",
  schema: { example: { error: "Application not found" } },
});

export const CronUnauthorizedResponse = ApiUnauthorizedResponse({
  description:
    "Missing or incorrect Authorization header (expected `Authorization: Bearer <CRON_SECRET>`)",
  schema: { example: { error: "Unauthorized" } },
});

export const InvalidStatusTransitionResponse = ApiBadRequestResponse({
  description:
    "The application isn't in a status this action can be performed from",
  schema: {
    example: {
      error: "Cannot withdraw an application that is already REJECTED",
      code: "INVALID_STATUS_TRANSITION",
    },
  },
});

export const ApplicationUpdateConflictResponse = ApiConflictResponse({
  description:
    "The application was updated concurrently (e.g. by the employer) between the caller's last read and this request",
  schema: {
    example: {
      error:
        "Application was updated concurrently — please refresh and try again",
      code: "APPLICATION_UPDATE_CONFLICT",
    },
  },
});
