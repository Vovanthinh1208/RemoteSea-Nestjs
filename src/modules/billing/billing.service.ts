import { Inject, Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import Stripe from "stripe";
import { BillingRepository } from "./billing.repository";
import { STRIPE_CLIENT, STUCK_JOB_GRACE_MS } from "./constants";
import type { CheckoutSessionResult } from "./interfaces";
import {
  BadRequestApiException,
  ServiceUnavailableApiException,
} from "@/common/exceptions/api.exception";
import { ErrorCode } from "@/common/exceptions/error-codes";
import { EmailService } from "@/common/services/email.service";
import { PLAN_LABELS, PLAN_PRICES } from "@/common/constants/plan.constants";
import { runInBackground } from "@/common/utils/background-task.util";
import { CircuitBreaker } from "@/common/utils/circuit-breaker";
import type { EnvConfig } from "@/core/config/env.validation";
import type { JobPayer } from "./guards/job-payer-ownership.guard";
import { JobsService } from "@/modules/jobs/jobs.service";
import {
  isEligibleForAutoApproval,
  parseBannedKeywords,
} from "@/modules/jobs/job-verification.util";

// Opens after 5 consecutive failures and stays open for 30s before letting a
// single trial through — same thresholds as EmailService's breaker. Unlike
// email (best-effort, safe to silently drop), a checkout session is something
// the caller is actively waiting on, so an open circuit fails fast with a
// clear 503 instead of silently skipping — the point is only to stop every
// request during a real Stripe outage from individually paying the full
// timeout+maxNetworkRetries wait (up to ~30s each, see billing.module.ts)
// once the outage is already known.
const BREAKER_FAILURE_THRESHOLD = 5;
const BREAKER_COOLDOWN_MS = 30_000;

@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);
  private readonly breaker = new CircuitBreaker(
    BREAKER_FAILURE_THRESHOLD,
    BREAKER_COOLDOWN_MS,
  );

  // Same reasoning as AlertsService.dispatchInProgress / ApplicationsService.
  // dispatchInProgress — guards against two overlapping reconciliation runs
  // re-querying the same stuck jobs; process-local only, not a cross-replica
  // lock. approveForReview's own CAS is what actually prevents a double-
  // approve, this just avoids redundant work on this instance.
  private reconcileInProgress = false;

  constructor(
    @Inject(STRIPE_CLIENT) private readonly stripe: Stripe,
    private readonly billingRepository: BillingRepository,
    private readonly emailService: EmailService,
    private readonly config: ConfigService<EnvConfig, true>,
    private readonly jobsService: JobsService,
  ) {}

  // Read per call (not cached in the constructor) so it's trivially
  // testable and follows the same ConfigService access as everything else.
  private bannedKeywords(): string[] {
    return parseBannedKeywords(
      this.config.get("JOB_BANNED_KEYWORDS", { infer: true }),
    );
  }

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

    if (this.breaker.isOpen()) {
      throw new ServiceUnavailableApiException(
        "Payment processing is temporarily unavailable. Please try again shortly.",
      );
    }

    const appUrl = this.config.get("FRONTEND_URL", { infer: true });

    let checkout: Stripe.Checkout.Session;
    try {
      checkout = await this.stripe.checkout.sessions.create(
        {
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
        },
        // The client's own maxNetworkRetries only dedupes this SDK call's own
        // internal retries — it does nothing for a genuine double-submit
        // (double-click, a client-side retry after a perceived timeout). Since
        // checkout-session creation never flips job.status off DRAFT, two
        // concurrent requests both pass the guard above and would otherwise
        // create two separate Stripe sessions for the same job. Keying on
        // job.id makes a duplicate request return the original session instead.
        { idempotencyKey: `checkout:${job.id}` },
      );
      this.breaker.onSuccess();
    } catch (error) {
      this.breaker.onFailure();
      throw error;
    }

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
    } catch (error) {
      // The client only ever gets the generic message below — never these
      // details — but without logging them server-side, a misconfigured
      // STRIPE_WEBHOOK_SECRET (every legitimate Stripe delivery fails this
      // exact check) looks identical to a forged request: "jobs never go
      // paid" with nothing in the logs to explain why.
      this.logger.warn(
        "Stripe webhook signature verification failed",
        error instanceof Error ? error.message : error,
      );
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
          const eligible = isEligibleForAutoApproval(
            {
              title: job.title,
              description: job.description,
              salaryMin: job.salaryMin,
              categoryCount: job.categories.length,
            },
            job.employer.isVerified,
            this.bannedKeywords(),
          );

          // approveForReview is itself conditioned on status === PENDING_REVIEW
          // (jobs.repository.ts's approveJob), so this can't race a concurrent
          // admin action into a double-approve — it just no-ops if the job
          // already moved.
          if (eligible) {
            await this.jobsService.approveForReview(jobId);
          }

          // Payment is already recorded above — an email failure here must return
          // 200 to Stripe, not trigger a webhook retry: markJobPaidAndSubmitted is
          // idempotent on planPaid, so a retry would just no-op and the email would
          // never go out at all. Background send also acks Stripe faster (Stripe
          // times out slow webhook handlers and retries them).
          runInBackground(
            eligible
              ? this.emailService.sendJobLiveEmail(
                  job.employer.user.email,
                  job.title,
                  job.slug,
                )
              : this.emailService.sendJobSubmittedEmail(
                  job.employer.user.email,
                  job.title,
                ),
            this.logger,
            `Failed to send job-${eligible ? "live" : "submitted"} email for job ${jobId}`,
          );
        }
      }
    }

    return { received: true };
  }

  // Cron-triggered (GET /billing/cron/reconcile, CronSecretGuard — same
  // external-scheduler shape as ApplicationsService.dispatchBacklogReminders
  // and JobsService.expireStaleJobs). Closes the gap where
  // markJobPaidAndSubmitted and the conditional approveForReview above are
  // two separate, non-atomic writes: if the process dies (or approveForReview
  // throws) between them, the webhook's own idempotency guard means a Stripe
  // retry sees planPaid already true and skips the whole block forever —
  // the job is stuck paid but never activated, with nothing to notice. This
  // re-evaluates auto-approval eligibility fresh for every job that's been
  // PENDING_REVIEW-with-planPaid-true for too long and completes it.
  async reconcileStuckJobs(): Promise<{ checked: number; approved: number }> {
    if (this.reconcileInProgress) {
      this.logger.warn(
        "Skipped reconcileStuckJobs: a previous run on this instance is still in progress.",
      );
      return { checked: 0, approved: 0 };
    }

    this.reconcileInProgress = true;
    const start = Date.now();
    try {
      const cutoff = new Date(Date.now() - STUCK_JOB_GRACE_MS);
      const stuckJobs = await this.billingRepository.findStuckPaidJobs(cutoff);
      const bannedKeywords = this.bannedKeywords();

      let approved = 0;
      for (const job of stuckJobs) {
        const eligible = isEligibleForAutoApproval(
          {
            title: job.title,
            description: job.description,
            salaryMin: job.salaryMin,
            categoryCount: job.categories.length,
          },
          job.employer.isVerified,
          bannedKeywords,
        );
        if (!eligible) continue;

        // Conditioned on status === PENDING_REVIEW (jobs.repository.ts's
        // approveJob) — null here means something else already moved this
        // job on since findStuckPaidJobs read it a moment ago, not an error.
        const result = await this.jobsService.approveForReview(job.id);
        if (!result) continue;

        approved += 1;
        runInBackground(
          this.emailService.sendJobLiveEmail(
            job.employer.user.email,
            job.title,
            job.slug,
          ),
          this.logger,
          `Failed to send job-live email for reconciled job ${job.id}`,
        );
      }

      this.logger.log(
        `reconcileStuckJobs finished: checked ${stuckJobs.length} stuck job(s), approved ${approved} in ${Date.now() - start}ms`,
      );
      return { checked: stuckJobs.length, approved };
    } finally {
      this.reconcileInProgress = false;
    }
  }
}
