import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
} from "@nestjs/swagger";
import {
  TalentProfileRequiredExample,
  ValidationErrorExample,
  WorkExperienceLimitReachedExample,
  WorkExperienceNotFoundExample,
} from "./work-experience.examples";

/** Reusable, module-specific Swagger response decorators for the Work Experience module. */

export const ValidationErrorResponse = ApiBadRequestResponse({
  description: "Zod schema validation failed",
  schema: { example: ValidationErrorExample },
});

export const TalentProfileRequiredResponse = ApiForbiddenResponse({
  description:
    "The caller has no TalentProfile yet — create one via PUT /talent/me first",
  schema: { example: TalentProfileRequiredExample },
});

export const WorkExperienceLimitReachedResponse = ApiConflictResponse({
  description: "The caller already has the maximum number of entries (5)",
  schema: { example: WorkExperienceLimitReachedExample },
});

export const WorkExperienceNotFoundResponse = ApiNotFoundResponse({
  description:
    "Entry doesn't exist or belongs to another user's profile (ownership enforced by WorkExperienceOwnershipGuard, not just a where filter)",
  schema: { example: WorkExperienceNotFoundExample },
});
