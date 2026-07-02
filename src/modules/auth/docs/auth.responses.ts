import { ApiBadRequestResponse, ApiConflictResponse, ApiTooManyRequestsResponse, ApiUnauthorizedResponse } from "@nestjs/swagger";
import { ValidationErrorExample } from "./auth.examples";

/** Reusable, module-specific Swagger response decorators for the Auth module. */

export const ValidationErrorResponse = ApiBadRequestResponse({
  description: "Zod schema validation failed",
  schema: { example: ValidationErrorExample },
});

export const InvalidCredentialsResponse = ApiUnauthorizedResponse({
  description: "No user with that email, an OAuth-only account with no password, or a wrong password",
  schema: { example: { error: "Invalid email or password" } },
});

export const EmailAlreadyRegisteredResponse = ApiConflictResponse({
  description: "Email already registered",
  schema: { example: { error: "Email already registered" } },
});

export const InvalidOrExpiredTokenResponse = ApiBadRequestResponse({
  description: "Reset token doesn't exist or has expired",
  schema: { example: { error: "Invalid or expired token" } },
});

export const registerRateLimitResponse = (limit: string) =>
  ApiTooManyRequestsResponse({
    description: `Rate limit exceeded (${limit})`,
    schema: { example: { error: "Too many requests. Please slow down and try again shortly." } },
  });
