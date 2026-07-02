import { ApiBadRequestResponse, ApiNotFoundResponse, ApiUnauthorizedResponse } from "@nestjs/swagger";
import { AlertNotFoundExample, ValidationErrorExample } from "./alerts.examples";

/** Reusable, module-specific Swagger response decorators for the Alerts module. */

export const ValidationErrorResponse = ApiBadRequestResponse({
  description: "Zod schema validation failed",
  schema: { example: ValidationErrorExample },
});

export const AlertNotFoundResponse = ApiNotFoundResponse({
  description: "Alert doesn't exist or belongs to another user (ownership is enforced in the service, not just a where filter)",
  schema: { example: AlertNotFoundExample },
});

/**
 * GET /alerts/cron/dispatch is guarded by CronSecretGuard — a literal string
 * comparison of the Authorization header against CRON_SECRET, not JWT
 * verification — so it gets its own 401 description instead of the shared
 * UnauthorizedApiResponse (which describes JWT failures).
 */
export const CronUnauthorizedResponse = ApiUnauthorizedResponse({
  description: "Missing or incorrect Authorization header (expected `Authorization: Bearer <CRON_SECRET>`)",
  schema: { example: { error: "Unauthorized" } },
});
