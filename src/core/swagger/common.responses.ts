import {
  ApiForbiddenResponse,
  ApiInternalServerErrorResponse,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
} from "@nestjs/swagger";

/**
 * Cross-cutting Swagger response decorators shared by every module.
 *
 * GlobalExceptionFilter renders every thrown error as `{ "error": <string|object> }`
 * with a matching HTTP status — these three status codes recur on nearly every
 * protected route, so they're centralized here instead of redefined per module.
 */

export const UnauthorizedApiResponse = ApiUnauthorizedResponse({
  description: "Missing, invalid, or expired JWT",
  schema: { example: { error: "Unauthorized" } },
});

export const ForbiddenApiResponse = ApiForbiddenResponse({
  description: "Authenticated, but the caller's role or ownership doesn't permit this action",
  schema: { example: { error: "Forbidden" } },
});

export const InternalServerErrorApiResponse = ApiInternalServerErrorResponse({
  description: "Unhandled error (e.g. a database or upstream integration failure)",
  schema: { example: { error: "Internal server error" } },
});

export const rateLimitResponse = (limit: string) =>
  ApiTooManyRequestsResponse({
    description: `Rate limit exceeded (${limit})`,
    schema: { example: { error: "Too many requests. Please slow down and try again shortly." } },
  });
