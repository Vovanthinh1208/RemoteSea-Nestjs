import { ApiBadRequestResponse, ApiTooManyRequestsResponse } from "@nestjs/swagger";
import { IncorrectCurrentPasswordExample, SocialSignInNoPasswordExample, ValidationErrorExample } from "./users.examples";

/** Reusable, module-specific Swagger response decorators for the Users module. */

export const ValidationErrorResponse = ApiBadRequestResponse({
  description: "Zod schema validation failed",
  schema: { example: ValidationErrorExample },
});

export const SocialSignInNoPasswordResponse = ApiBadRequestResponse({
  description: "Account has no password hash (OAuth-only sign-in)",
  schema: { example: SocialSignInNoPasswordExample },
});

export const IncorrectCurrentPasswordResponse = ApiBadRequestResponse({
  description: "The supplied `currentPassword` doesn't match",
  schema: { example: IncorrectCurrentPasswordExample },
});

export const changePasswordRateLimitResponse = (limit: string) =>
  ApiTooManyRequestsResponse({
    description: `Rate limit exceeded (${limit})`,
    schema: { example: { error: "Too many requests. Please slow down and try again shortly." } },
  });
