import { ApiBadRequestResponse, ApiNotFoundResponse } from "@nestjs/swagger";
import {
  ProfileNotFoundExample,
  ValidationErrorExample,
} from "./talent.examples";

/** Reusable, module-specific Swagger response decorators for the Talent module. */

export const ValidationErrorResponse = ApiBadRequestResponse({
  description: "Zod schema validation failed",
  schema: { example: ValidationErrorExample },
});

export const ProfileNotFoundResponse = ApiNotFoundResponse({
  description: "The user has no TalentProfile",
  schema: { example: ProfileNotFoundExample },
});

export const InvalidOrExpiredVerificationTokenResponse = ApiBadRequestResponse({
  description: "Token doesn't exist, was already used, or has expired",
  schema: { example: { error: "Invalid or expired token" } },
});
