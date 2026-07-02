import { applyDecorators } from "@nestjs/common";
import { ApiBearerAuth, ApiBody, ApiCreatedResponse, ApiHeader, ApiOperation, ApiTags } from "@nestjs/swagger";
import { InternalServerErrorApiResponse, UnauthorizedApiResponse } from "@/core/swagger/common.responses";
import { CheckoutRequestDto, CheckoutResponseDto, WebhookResponseDto } from "./billing.dto";
import { CheckoutRequestExample, CheckoutResponseExample, WebhookResponseExample } from "./billing.examples";
import {
  InvalidSignatureResponse,
  JobNotFoundResponse,
  JobNotPayableResponse,
  MissingSignatureResponse,
  ValidationErrorResponse,
  checkoutRateLimitResponse,
} from "./billing.responses";

export const ApiBillingTag = () => applyDecorators(ApiTags("Billing"));

export const ApiCheckout = () =>
  applyDecorators(
    ApiBearerAuth("bearer"),
    ApiOperation({
      summary: "Create a Stripe Checkout session",
      description:
        "Creates a Stripe Checkout session for a DRAFT, unpaid job owned by the current user and stores the session id on the job. " +
        "Line item price comes from PLAN_PRICES[job.planType] in cents (STANDARD=15000, FEATURED=35000, HANDS_ON=120000).",
    }),
    ApiBody({ type: CheckoutRequestDto, examples: { default: { value: CheckoutRequestExample } } }),
    ApiCreatedResponse({ description: "Checkout session created", type: CheckoutResponseDto, schema: { example: CheckoutResponseExample } }),
    ValidationErrorResponse,
    JobNotPayableResponse,
    UnauthorizedApiResponse,
    JobNotFoundResponse,
    checkoutRateLimitResponse("10 req/60s per user"),
    InternalServerErrorApiResponse
  );

export const ApiWebhook = () =>
  applyDecorators(
    ApiOperation({
      summary: "Stripe webhook receiver",
      description:
        "On `checkout.session.completed`, marks the job paid, moves it to PENDING_REVIEW, and emails the employer. " +
        "**Auth**: no JWT/guard — authenticity is verified via the Stripe signature (`stripe.webhooks.constructEvent` against STRIPE_WEBHOOK_SECRET). " +
        "Relies on `rawBody: true` in main.ts. Non-`checkout.session.completed` events, or events missing `metadata.jobId`, are accepted (200) but are no-ops.",
    }),
    ApiHeader({ name: "stripe-signature", required: true, description: "Stripe webhook signature, verified against STRIPE_WEBHOOK_SECRET" }),
    ApiBody({ description: "Raw Stripe Event JSON payload" }),
    ApiCreatedResponse({ description: "Event processed (or accepted as a no-op)", type: WebhookResponseDto, schema: { example: WebhookResponseExample } }),
    MissingSignatureResponse,
    InvalidSignatureResponse,
    InternalServerErrorApiResponse
  );
