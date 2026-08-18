import {
  ApiBadRequestResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
} from "@nestjs/swagger";
import { ValidationErrorExample } from "./messages.examples";

/** Reusable, module-specific Swagger response decorators for the Messages module. */

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
