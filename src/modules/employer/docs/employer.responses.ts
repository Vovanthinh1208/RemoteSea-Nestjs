import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
} from "@nestjs/swagger";
import { EmployerValidationErrorExample } from "./employer.examples";

/** Reusable, module-specific Swagger response decorators for the Employer module. */

export const ValidationErrorResponse = ApiBadRequestResponse({
  description: "Zod schema validation failed",
  schema: { example: EmployerValidationErrorExample },
});

export const EmployerProfileAlreadyExistsResponse = ApiConflictResponse({
  description: "The authenticated user already has an EmployerProfile",
  schema: { example: { error: "Employer profile already exists" } },
});

export const EmployerProfileNotFoundResponse = ApiNotFoundResponse({
  description: "No EmployerProfile exists for the authenticated user",
  schema: { example: { error: "Profile not found" } },
});

export const EmployerProfileRequiredResponse = ApiForbiddenResponse({
  description:
    "Caller has the EMPLOYER role but has not created an EmployerProfile yet",
  schema: { example: { error: "Employer profile required" } },
});

export const JobNotFoundResponse = ApiNotFoundResponse({
  description: "No job with that id, or it isn't owned by the caller",
  schema: { example: { error: "Job not found" } },
});

export const ApplicationNotFoundResponse = ApiNotFoundResponse({
  description: "No application with that id",
  schema: { example: { error: "Application not found" } },
});

export const ApplicationConflictResponse = ApiConflictResponse({
  description:
    "The application's status changed between read and write (e.g. a concurrent update) — retry with fresh data",
  schema: {
    example: {
      error:
        "Application was updated concurrently — please refresh and try again",
    },
  },
});

export const NotOwningEmployerResponse = ApiForbiddenResponse({
  description:
    "Authenticated, but the caller does not own the job/application (ownership is checked in the service, not via @Roles())",
  schema: { example: { error: "Forbidden" } },
});

export const IllegalTransitionResponse = ApiBadRequestResponse({
  description:
    "Validation failure, or the requested status is not a legal transition from the application's current status",
  schema: {
    examples: {
      validation: { value: EmployerValidationErrorExample },
      illegalTransition: {
        value: { error: "Cannot transition from PENDING to OFFERED" },
      },
    },
  },
});

export const VerificationRejectedResponse = ApiBadRequestResponse({
  description:
    "No website on file, or the submitted email's domain doesn't match the company website",
  schema: {
    examples: {
      validation: { value: EmployerValidationErrorExample },
      noWebsite: {
        value: { error: "Add a company website before verifying" },
      },
      domainMismatch: {
        value: { error: "Email domain must match your company website" },
      },
    },
  },
});

export const InvalidOrExpiredVerificationTokenResponse = ApiBadRequestResponse({
  description: "Token doesn't exist, was already used, or has expired",
  schema: { example: { error: "Invalid or expired token" } },
});
