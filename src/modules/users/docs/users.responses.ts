import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiNotFoundResponse,
} from "@nestjs/swagger";
import {
  CannotRevokeCurrentSessionExample,
  ConnectionNotFoundExample,
  EmptyAccountBodyErrorExample,
  IncorrectCurrentPasswordExample,
  LastSignInMethodExample,
  SessionNotFoundExample,
  SocialSignInNoPasswordExample,
  ValidationErrorExample,
} from "./users.examples";

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

export const EmptyBodyValidationErrorResponse = ApiBadRequestResponse({
  description:
    "Request body has no recognized fields set (at least one is required)",
  schema: { example: EmptyAccountBodyErrorExample },
});

export const ConnectionNotFoundResponse = ApiBadRequestResponse({
  description: "No `Account` row for that provider is linked to this user",
  schema: { example: ConnectionNotFoundExample },
});

export const LastSignInMethodResponse = ApiConflictResponse({
  description: "Disconnecting would leave the account with no way to sign in",
  schema: { example: LastSignInMethodExample },
});

export const SessionNotFoundResponse = ApiNotFoundResponse({
  description: "No matching non-revoked session owned by this user",
  schema: { example: SessionNotFoundExample },
});

export const CannotRevokeCurrentSessionResponse = ApiBadRequestResponse({
  description:
    "`id` is the caller's own current session — use sign-out instead",
  schema: { example: CannotRevokeCurrentSessionExample },
});
