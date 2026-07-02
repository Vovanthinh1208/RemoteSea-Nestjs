import { ApiBadRequestResponse } from "@nestjs/swagger";
import { TaxonomyValidationErrorExample } from "./taxonomy.examples";

/** Reusable, module-specific Swagger response decorators for the Taxonomy module. */

export const ValidationErrorResponse = ApiBadRequestResponse({
  description: "Zod schema validation failed",
  schema: { example: TaxonomyValidationErrorExample },
});
