import { ApiBadRequestResponse } from "@nestjs/swagger";
import { ValidationErrorExample } from "./saved.examples";

/** Reusable, module-specific Swagger response decorators for the Saved Jobs module. */

export const ValidationErrorResponse = ApiBadRequestResponse({
  description: "Zod schema validation failed",
  schema: { example: ValidationErrorExample },
});
