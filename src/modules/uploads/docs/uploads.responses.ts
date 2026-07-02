import { ApiBadRequestResponse } from "@nestjs/swagger";
import { UnsupportedContentTypeExample, ValidationErrorExample } from "./uploads.examples";

/** Reusable, module-specific Swagger response decorators for the Uploads module. */

export const ValidationErrorResponse = ApiBadRequestResponse({
  description: "Zod schema validation failed",
  schema: { example: ValidationErrorExample },
});

export const UnsupportedContentTypeResponse = ApiBadRequestResponse({
  description: "`contentType` is not in the allowed set for the given `type` (avatar/logo → image/jpeg, image/png, image/webp; resume → application/pdf)",
  schema: { example: UnsupportedContentTypeExample },
});
