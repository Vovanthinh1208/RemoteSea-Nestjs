import { Inject, Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import Stripe from "stripe";
import { BillingRepository } from "./billing.repository";
import { STRIPE_CLIENT } from "./constants";
import type { CheckoutSessionResult } from "./interfaces";
import { BadRequestApiException } from "@/common/exceptions/api.exception";
import { ErrorCode } from "@/common/exceptions/error-codes";
import { EmailService } from "@/common/services/email.service";
import { PLAN_LABELS, PLAN_PRICES } from "@/common/constants/plan.constants";
import type { EnvConfig } from "@/core/config/env.validation";
import type { JobPayer } from "./guards/job-payer-ownership.guard";

@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);

  constructor(
    @Inject(STRIPE_CLIENT) private readonly stripe: Stripe,
    private readonly billingRepository: BillingRepository,
    private readonly emailService: EmailService,
    private readonly config: ConfigService<EnvConfig, true>,
  ) {}

  async createCheckoutSession(
    job: JobPayer,
    userId: string,
  ): Promise<CheckoutSessionResult> {
    // Ownership is already enforced by JobPayerOwnershipGuard before this runs.
    if (job.status !== "DRAFT" || job.planPaid) {
      throw new BadRequestApiException(
        "Job is not payable",
        ErrorCode.JOB_NOT_PAYABLE,
      );
    }

    const appUrl = this.config.get("FRONTEND_URL", { infer: true });

    const checkout = await this.stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "usd",
            unit_amount: PLAN_PRICES[job.planType],
            product_data: {
              name: `${PLAN_LABELS[job.planType]} — ${job.title}`,
            },
          },
        },
      ],
      success_url: `${appUrl}/post-job/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appUrl}/post-job?job=${job.id}`,
      metadata: { jobId: job.id, userId },
    });

    await this.billingRepository.setStripeSessionId(job.id, checkout.id);

    return { url: checkout.url };
  }

  async handleWebhookEvent(
    rawBody: Buffer,
    signature: string,
  ): Promise<{ received: true }> {
    const webhookSecret = this.config.get("STRIPE_WEBHOOK_SECRET", {
      infer: true,
    }) as string;

    let event: Stripe.Event;
    try {
      event = this.stripe.webhooks.constructEvent(
        rawBody,
        signature,
        webhookSecret,
      );
    } catch {
      throw new BadRequestApiException(
        "Invalid signature",
        ErrorCode.INVALID_WEBHOOK_SIGNATURE,
      );
    }

    if (event.type === "checkout.session.completed") {
      const checkoutSession = event.data.object as Stripe.Checkout.Session;
      const jobId = checkoutSession.metadata?.jobId;
      if (jobId) {
        const job = await this.billingRepository.markJobPaidAndSubmitted(jobId);
        if (job) {
          // Payment is already recorded above — an email failure here must return
          // 200 to Stripe, not trigger a webhook retry: markJobPaidAndSubmitted is
          // idempotent on planPaid, so a retry would just no-op and the email would
          // never go out at all.
          try {
            await this.emailService.sendJobSubmittedEmail(
              job.employer.user.email,
              job.title,
            );
          } catch (error) {
            this.logger.error(
              `Failed to send job-submitted email for job ${jobId}`,
              error instanceof Error ? error.stack : error,
            );
          }
        }
      }
    }

    return { received: true };
  }
}
