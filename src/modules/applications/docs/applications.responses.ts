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
