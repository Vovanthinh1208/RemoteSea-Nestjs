import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
} from "@nestjs/swagger";
import { ValidationErrorExample } from "./scorecards.examples";

/** Reusable, module-specific Swagger response decorators for the Interview Scorecards module. */

export const ValidationErrorResponse = ApiBadRequestResponse({
  description: "Zod schema validation failed",
  schema: { example: ValidationErrorExample },
});

export const ApplicationNotFoundResponse = ApiNotFoundResponse({
  description: "No application with that id",
  schema: { example: { error: "Not found" } },
});

export const ApplicationAccessDeniedResponse = ApiForbiddenResponse({
  description:
    "The caller isn't a company member with access to this application",
  schema: { example: { error: "Forbidden" } },
});

export const ScorecardNotEligibleResponse = ApiForbiddenResponse({
  description:
    "The application's interview hasn't been CONFIRMED yet, or its confirmed slot hasn't passed",
  schema: {
    example: {
      error: "Not eligible to submit feedback for this interview yet",
    },
  },
});

export const ScorecardAlreadyExistsResponse = ApiConflictResponse({
  description: "The caller already submitted a scorecard for this application",
  schema: {
    example: { error: "Already submitted feedback for this interview" },
  },
});
