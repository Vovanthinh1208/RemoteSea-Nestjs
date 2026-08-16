import { ApiBadRequestResponse, ApiNotFoundResponse } from "@nestjs/swagger";
import {
  EmployerNotFoundExample,
  JobNotFoundExample,
  ReportNotFoundExample,
  ValidationErrorExample,
} from "./admin.examples";

/** Reusable, module-specific Swagger response decorators for the Admin module. */

export const ValidationErrorResponse = ApiBadRequestResponse({
  description: "Zod schema validation failed",
  schema: { example: ValidationErrorExample },
});

export const EmployerNotFoundResponse = ApiNotFoundResponse({
  description: "No EmployerProfile with that id",
  schema: { example: EmployerNotFoundExample },
});

export const JobNotFoundResponse = ApiNotFoundResponse({
  description: "No Job with that id",
  schema: { example: JobNotFoundExample },
});

export const ReportNotFoundResponse = ApiNotFoundResponse({
  description: "No JobReport with that id",
  schema: { example: ReportNotFoundExample },
});

export const ReportAlreadyResolvedResponse = ApiBadRequestResponse({
  description: "The report is no longer OPEN (already resolved or dismissed)",
  schema: { example: { error: "Report is already resolved" } },
});
