import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiNotFoundResponse,
} from "@nestjs/swagger";
import { ValidationErrorExample } from "./job-reports.examples";

/** Reusable, module-specific Swagger response decorators for the Job Reports module. */

export const ValidationErrorResponse = ApiBadRequestResponse({
  description: "Zod schema validation failed",
  schema: { example: ValidationErrorExample },
});

export const JobAlreadyReportedResponse = ApiConflictResponse({
  description: "The caller already has an OPEN report on this job",
  schema: { example: { error: "You've already reported this job" } },
});

export const ReportJobNotFoundResponse = ApiNotFoundResponse({
  description: "No job with that id",
  schema: { example: { error: "Job not found" } },
});
