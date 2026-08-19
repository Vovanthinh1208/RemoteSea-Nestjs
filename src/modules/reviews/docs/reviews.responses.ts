import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
} from "@nestjs/swagger";
import {
  ApplicationNotFoundExample,
  ReviewAlreadyExistsExample,
  ReviewNotEligibleExample,
  ReviewValidationErrorExample,
} from "./reviews.examples";

/** Reusable, module-specific Swagger response decorators for the Reviews module. */

export const ValidationErrorResponse = ApiBadRequestResponse({
  description:
    "Zod schema validation failed, or a category rating doesn't apply to this review's direction",
  schema: { example: ReviewValidationErrorExample },
});

export const ApplicationNotFoundResponse = ApiNotFoundResponse({
  description:
    "No application with this id exists, or the caller isn't a party to it (same response either way)",
  schema: { example: ApplicationNotFoundExample },
});

export const ReviewNotEligibleResponse = ApiForbiddenResponse({
  description: "The application's interview hasn't been CONFIRMED yet",
  schema: { example: ReviewNotEligibleExample },
});

export const ReviewAlreadyExistsResponse = ApiConflictResponse({
  description: "The caller already reviewed this application",
  schema: { example: ReviewAlreadyExistsExample },
});
