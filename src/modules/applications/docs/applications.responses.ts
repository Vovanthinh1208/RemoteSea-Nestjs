import { ApiBadRequestResponse, ApiConflictResponse, ApiForbiddenResponse } from "@nestjs/swagger";
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
