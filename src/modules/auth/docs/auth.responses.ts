import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiUnauthorizedResponse,
} from "@nestjs/swagger";
import {
  IncorrectPasswordExample,
  InvalidChallengeTokenExample,
  InvalidOAuthExchangeCodeExample,
  InvalidTwoFactorCodeExample,
  TwoFactorSetupRequiredExample,
  ValidationErrorExample,
} from "./auth.examples";

/** Reusable, module-specific Swagger response decorators for the Auth module. */

export const ValidationErrorResponse = ApiBadRequestResponse({
  description: "Zod schema validation failed",
  schema: { example: ValidationErrorExample },
});

export const InvalidCredentialsResponse = ApiUnauthorizedResponse({
  description:
    "No user with that email, an OAuth-only account with no password, or a wrong password",
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

export const TwoFactorSetupRequiredResponse = ApiBadRequestResponse({
  description: "POST /auth/2fa/setup was never called (no pending secret)",
  schema: { example: TwoFactorSetupRequiredExample },
});

export const InvalidTwoFactorCodeResponse = ApiBadRequestResponse({
  description: "Code doesn't match the current TOTP window or any backup code",
  schema: { example: InvalidTwoFactorCodeExample },
});

export const InvalidChallengeTokenResponse = ApiUnauthorizedResponse({
  description:
    "Challenge token missing/expired/invalid, or not a 2FA challenge",
  schema: { example: InvalidChallengeTokenExample },
});

export const InvalidOAuthExchangeCodeResponse = ApiUnauthorizedResponse({
  description:
    "Exchange code missing/expired/invalid, not an OAuth exchange code, or the account it names no longer exists",
  schema: { example: InvalidOAuthExchangeCodeExample },
});

export const IncorrectPasswordResponse = ApiUnauthorizedResponse({
  description: "Wrong password",
  schema: { example: IncorrectPasswordExample },
});
