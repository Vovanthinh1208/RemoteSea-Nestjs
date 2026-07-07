import { ApiBadRequestResponse, ApiNotFoundResponse } from "@nestjs/swagger";
import { InvalidSignatureExample, JobNotFoundExample, JobNotPayableExample, MissingSignatureExample, ValidationErrorExample } from "./billing.examples";

/** Reusable, module-specific Swagger response decorators for the Billing module. */

export const ValidationErrorResponse = ApiBadRequestResponse({
  description: "Zod schema validation failed",
  schema: { example: ValidationErrorExample },
});

export const JobNotPayableResponse = ApiBadRequestResponse({
  description: "Job is not DRAFT, or is already marked planPaid",
  schema: { example: JobNotPayableExample },
});

export const JobNotFoundResponse = ApiNotFoundResponse({
  description: "Job doesn't exist or isn't owned by the caller",
  schema: { example: JobNotFoundExample },
});

export const MissingSignatureResponse = ApiBadRequestResponse({
  description: "`stripe-signature` header absent, or `rawBody` missing (see `rawBody: true` in main.ts)",
  schema: { example: MissingSignatureExample },
});

export const InvalidSignatureResponse = ApiBadRequestResponse({
  description: "Stripe signature verification failed (`stripe.webhooks.constructEvent` against `STRIPE_WEBHOOK_SECRET`)",
  schema: { example: InvalidSignatureExample },
});
