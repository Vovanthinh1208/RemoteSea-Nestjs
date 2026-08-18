import { ApiBadRequestResponse, ApiNotFoundResponse } from "@nestjs/swagger";
import { ValidationErrorExample } from "./notifications.examples";

/** Reusable, module-specific Swagger response decorators for the Notifications module. */

export const ValidationErrorResponse = ApiBadRequestResponse({
  description: "Zod schema validation failed",
  schema: { example: ValidationErrorExample },
});

export const NotificationNotFoundResponse = ApiNotFoundResponse({
  description: "No notification with that id belonging to the caller",
  schema: { example: { error: "Notification not found" } },
});
