import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
} from "@nestjs/swagger";
import {
  ProfileHighlightLimitReachedExample,
  ProfileHighlightNotFoundExample,
  TalentProfileRequiredExample,
  ValidationErrorExample,
} from "./profile-highlights.examples";

/** Reusable, module-specific Swagger response decorators for the Profile Highlights module. */

export const ValidationErrorResponse = ApiBadRequestResponse({
  description: "Zod schema validation failed",
  schema: { example: ValidationErrorExample },
});

export const TalentProfileRequiredResponse = ApiForbiddenResponse({
  description:
    "The caller has no TalentProfile yet — create one via PUT /talent/me first",
  schema: { example: TalentProfileRequiredExample },
});

export const ProfileHighlightLimitReachedResponse = ApiConflictResponse({
  description:
    "The caller already has the maximum number of entries (5) for this `type`",
  schema: { example: ProfileHighlightLimitReachedExample },
});

export const ProfileHighlightNotFoundResponse = ApiNotFoundResponse({
  description:
    "Entry doesn't exist or belongs to another user's profile (ownership enforced by ProfileHighlightOwnershipGuard, not just a where filter)",
  schema: { example: ProfileHighlightNotFoundExample },
});
