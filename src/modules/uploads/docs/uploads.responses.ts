import { ApiBadRequestResponse } from "@nestjs/swagger";
import {
  FileTooLargeExample,
  UnsupportedContentTypeExample,
  ValidationErrorExample,
} from "./uploads.examples";

/** Reusable, module-specific Swagger response decorators for the Uploads module. */

export const ValidationErrorResponse = ApiBadRequestResponse({
  description: "Zod schema validation failed",
  schema: { example: ValidationErrorExample },
});

export const UnsupportedContentTypeResponse = ApiBadRequestResponse({
  description:
    "`contentType` is not in the allowed set for the given `type` (avatar/logo → image/jpeg, image/png, image/webp; resume → application/pdf)",
  schema: { example: UnsupportedContentTypeExample },
});

export const FileTooLargeResponse = ApiBadRequestResponse({
  description:
    "`fileSize` exceeds the max for the given `type` (avatar/logo 5MB, resume 10MB)",
  schema: { example: FileTooLargeExample },
});
