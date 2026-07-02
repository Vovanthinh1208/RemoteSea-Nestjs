import { ApiResponse } from "@nestjs/swagger";
import { HealthErrorExample } from "./health.examples";

/**
 * Reusable, module-specific Swagger response decorator for the Health module.
 *
 * This is intentionally NOT built from ApiInternalServerErrorResponse /
 * InternalServerErrorApiResponse — the route returns 503 (not 500) and a
 * `{ status, db }` body, not the app-wide `{ error }` shape, because it
 * writes the response manually via @Res() and bypasses GlobalExceptionFilter.
 */
export const HealthUnavailableResponse = ApiResponse({
  status: 503,
  description:
    "Database unreachable — the `SELECT 1` liveness query failed. Note this is NOT the `{ error }` shape used elsewhere in the API.",
  schema: { example: HealthErrorExample },
});
