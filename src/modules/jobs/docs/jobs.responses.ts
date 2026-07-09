import {
  ApiBadRequestResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
} from "@nestjs/swagger";
import { JobsValidationErrorExample } from "./jobs.examples";

/** Reusable, module-specific Swagger response decorators for the Jobs module. */

export const ValidationErrorResponse = ApiBadRequestResponse({
  description: "Zod schema validation failed",
  schema: { example: JobsValidationErrorExample },
});

export const InvalidSalaryRangeResponse = ApiBadRequestResponse({
  description: "Validation failure, or salaryMax is less than salaryMin",
  schema: {
    examples: {
      validation: { value: JobsValidationErrorExample },
      salaryRange: {
        value: {
          error: "salaryMax must be greater than or equal to salaryMin",
        },
      },
    },
  },
});

export const EmployerProfileRequiredResponse = ApiForbiddenResponse({
  description: "The authenticated user has no EmployerProfile yet",
  schema: { example: { error: "Employer profile required" } },
});

export const JobNotFoundResponse = ApiNotFoundResponse({
  description: "No job with that id",
  schema: { example: { error: "Job not found" } },
});

export const NotOwnerOrNotEditableResponse = ApiForbiddenResponse({
  description:
    "Caller is not ADMIN, doesn't own the job, or the job isn't DRAFT/REJECTED",
  schema: {
    examples: {
      notOwner: { value: { error: "Forbidden" } },
      notEditable: {
        value: { error: "Only draft or rejected jobs can be edited" },
      },
    },
  },
});
