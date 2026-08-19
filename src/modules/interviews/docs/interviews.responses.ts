import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
} from "@nestjs/swagger";
import { ValidationErrorExample } from "./interviews.examples";

/** Reusable, module-specific Swagger response decorators for the Interviews module. */

export const ValidationErrorResponse = ApiBadRequestResponse({
  description: "Zod schema validation failed",
  schema: { example: ValidationErrorExample },
});

export const ApplicationNotFoundResponse = ApiNotFoundResponse({
  description: "No application with that id",
  schema: { example: { error: "Not found" } },
});

export const ApplicationAccessDeniedResponse = ApiForbiddenResponse({
  description: "The application isn't the caller's own",
  schema: { example: { error: "Forbidden" } },
});

export const NotAtInterviewStageResponse = ApiBadRequestResponse({
  description: "The application hasn't reached the INTERVIEW stage yet",
  schema: {
    example: {
      error: "The application must be at the INTERVIEW stage before scheduling",
    },
  },
});

export const InvalidSlotResponse = ApiBadRequestResponse({
  description:
    "A proposed slot was in the past, or the confirmed slot wasn't one of the proposed options",
  schema: {
    example: { error: "Proposed interview times must be in the future" },
  },
});

export const InterviewNotFoundResponse = ApiNotFoundResponse({
  description: "No interview has been proposed for this application yet",
  schema: {
    example: {
      error: "No interview has been proposed for this application yet",
    },
  },
});

export const InterviewAlreadyConfirmedResponse = ApiConflictResponse({
  description:
    "The interview is already confirmed and can no longer be revised",
  schema: { example: { error: "This interview is already confirmed" } },
});
