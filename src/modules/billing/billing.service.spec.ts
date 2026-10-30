import Stripe from "stripe";
import { BillingService } from "./billing.service";
import {
  BadRequestApiException,
  ServiceUnavailableApiException,
} from "@/common/exceptions/api.exception";
import type { JobPayer } from "./guards/job-payer-ownership.guard";

// Ownership is enforced upstream by JobPayerOwnershipGuard — this test covers
// only what's left in the service: the payability check.

describe("BillingService.createCheckoutSession", () => {
  const makeService = (stripeCreate: jest.Mock) => {
    const stripe = { checkout: { sessions: { create: stripeCreate } } };
    const billingRepository = { setStripeSessionId: jest.fn() };
    const config = {
      get: jest.fn().mockReturnValue("https://app.example.com"),
    };
    return new BillingService(
      stripe as never,
      billingRepository as never,
      {} as never,
      config as never,
      {} as never,
    );
  };

  it("rejects a job that isn't DRAFT", async () => {
    const service = makeService(jest.fn());
    const job = { status: "ACTIVE", planPaid: false } as JobPayer;

    await expect(
      service.createCheckoutSession(job, "owner-1"),
    ).rejects.toBeInstanceOf(BadRequestApiException);
  });

  it("rejects a job that's already paid", async () => {
    const service = makeService(jest.fn());
    const job = { status: "DRAFT", planPaid: true } as JobPayer;

    await expect(
      service.createCheckoutSession(job, "owner-1"),
    ).rejects.toBeInstanceOf(BadRequestApiException);
  });

  it("creates a checkout session for a payable job", async () => {
    const stripeCreate = jest.fn().mockResolvedValue({
      id: "cs_1",
      url: "https://checkout.stripe.com/cs_1",
    });
    const service = makeService(stripeCreate);
    const job = {
      id: "job-1",
      status: "DRAFT",
      planPaid: false,
      planType: "STANDARD",
      title: "Backend Engineer",
    } as JobPayer;

    const result = await service.createCheckoutSession(job, "owner-1");
    expect(stripeCreate).toHaveBeenCalled();
    expect(result.url).toBe("https://checkout.stripe.com/cs_1");
  });

  // PB43: a cancelled payment returns to the dashboard ("Pay to publish" on
  // the DRAFT row), not the wizard that would create a second job.
  it("sends a cancelled checkout back to the employer dashboard", async () => {
    const stripeCreate = jest
      .fn()
      .mockResolvedValue({ id: "cs_1", url: "https://checkout.stripe.com" });
    const service = makeService(stripeCreate);
    const job = {
      id: "job-1",
      status: "DRAFT",
      planPaid: false,
      planType: "STANDARD",
      title: "Backend Engineer",
    } as JobPayer;

    await service.createCheckoutSession(job, "owner-1");
    expect(stripeCreate.mock.calls[0][0].cancel_url).toBe(
      "https://app.example.com/employer-dashboard?checkout=cancelled",
    );
  });

  it("maps Stripe being unreachable to 503 and stores no session", async () => {
    const stripeCreate = jest.fn().mockRejectedValue(
      new Stripe.errors.StripeConnectionError({
        type: "api_error",
        message: "getaddrinfo ENOTFOUND api.stripe.com",
      }),
    );
    const billingRepository = { setStripeSessionId: jest.fn() };
    const service = new BillingService(
      { checkout: { sessions: { create: stripeCreate } } } as never,
      billingRepository as never,
      {} as never,
      { get: jest.fn().mockReturnValue("https://app.example.com") } as never,
      {} as never,
    );
    const job = {
      id: "job-1",
      status: "DRAFT",
      planPaid: false,
      planType: "STANDARD",
      title: "Backend Engineer",
    } as JobPayer;

    await expect(
      service.createCheckoutSession(job, "owner-1"),
    ).rejects.toBeInstanceOf(ServiceUnavailableApiException);
    expect(billingRepository.setStripeSessionId).not.toHaveBeenCalled();
  });

  // Stripe rejects a reused idempotency key whose parameters changed, so a
  // retry after switching plan (or editing the title) needs a different key,
  // while a genuine double-submit must still share one.
  it("keys idempotency on the request: same for a repeat, new after a plan or title change", async () => {
    const stripeCreate = jest
      .fn()
      .mockResolvedValue({ id: "cs_1", url: "https://checkout.stripe.com" });
    const service = makeService(stripeCreate);
    const job = {
      id: "job-1",
      status: "DRAFT",
      planPaid: false,
      planType: "STANDARD",
      title: "Backend Engineer",
    } as JobPayer;

    await service.createCheckoutSession(job, "owner-1");
    await service.createCheckoutSession(job, "owner-1");
    await service.createCheckoutSession(
      { ...job, planType: "FEATURED" } as JobPayer,
      "owner-1",
    );
    await service.createCheckoutSession(
      { ...job, title: "Senior Backend Engineer" } as JobPayer,
      "owner-1",
    );
    const keys = stripeCreate.mock.calls.map(
      (call) => call[1].idempotencyKey as string,
    );
    expect(keys[0]).toBe(keys[1]);
    expect(keys[0]).toMatch(/^checkout:job-1:[0-9a-f]{32}$/);
    expect(new Set(keys).size).toBe(3);
  });

  // Same threshold/cooldown as EmailService's breaker (5 consecutive
  // failures) — verifies BillingService wires it up correctly, not the
  // breaker's own state machine (covered by circuit-breaker.spec.ts).
  it("fails fast with ServiceUnavailableApiException after 5 consecutive Stripe failures, without calling Stripe again", async () => {
    const stripeCreate = jest.fn().mockRejectedValue(new Error("stripe down"));
    const service = makeService(stripeCreate);
    const job = {
      id: "job-1",
      status: "DRAFT",
      planPaid: false,
      planType: "STANDARD",
      title: "Backend Engineer",
    } as JobPayer;

    for (let i = 0; i < 5; i += 1) {
      await expect(
        service.createCheckoutSession(job, "owner-1"),
      ).rejects.toThrow("stripe down");
    }
    expect(stripeCreate).toHaveBeenCalledTimes(5);

    await expect(
      service.createCheckoutSession(job, "owner-1"),
    ).rejects.toBeInstanceOf(ServiceUnavailableApiException);
    expect(stripeCreate).toHaveBeenCalledTimes(5);
  });
});

describe("BillingService.handleWebhookEvent auto-approval", () => {
  const baseJob = {
    id: "job-1",
    title: "Backend Engineer",
    slug: "backend-engineer",
    description: "x".repeat(100),
    salaryMin: 1000,
    categories: [{ categoryId: "cat-1" }],
    employer: { isVerified: true, user: { email: "employer@acme.com" } },
  };

  const makeService = ({
    job,
    jobsService = { approveForReview: jest.fn() },
  }: {
    job: typeof baseJob | null;
    jobsService?: { approveForReview: jest.Mock };
  }) => {
    const stripe = {
      webhooks: {
        constructEvent: jest.fn().mockReturnValue({
          type: "checkout.session.completed",
          data: { object: { metadata: { jobId: "job-1" } } },
        }),
      },
    };
    const billingRepository = {
      markJobPaidAndSubmitted: jest.fn().mockResolvedValue(job),
    };
    const emailService = {
      sendJobLiveEmail: jest.fn().mockResolvedValue(undefined),
      sendJobSubmittedEmail: jest.fn().mockResolvedValue(undefined),
    };
    const config = { get: jest.fn().mockReturnValue("whsec_test") };
    const service = new BillingService(
      stripe as never,
      billingRepository as never,
      emailService as never,
      config as never,
      jobsService as never,
    );
    return { service, jobsService, emailService, config };
  };

  it("auto-approves and sends the live email for a verified employer with a complete job", async () => {
    const { service, jobsService, emailService } = makeService({
      job: baseJob,
    });

    await service.handleWebhookEvent(Buffer.from(""), "sig");

    expect(jobsService.approveForReview).toHaveBeenCalledWith("job-1");
    expect(emailService.sendJobLiveEmail).toHaveBeenCalledWith(
      "employer@acme.com",
      "Backend Engineer",
      "backend-engineer",
    );
  });

  it("leaves the job queued and sends the submitted email when the employer isn't verified", async () => {
    const { service, jobsService, emailService } = makeService({
      job: { ...baseJob, employer: { ...baseJob.employer, isVerified: false } },
    });

    await service.handleWebhookEvent(Buffer.from(""), "sig");

    expect(jobsService.approveForReview).not.toHaveBeenCalled();
    expect(emailService.sendJobSubmittedEmail).toHaveBeenCalledWith(
      "employer@acme.com",
      "Backend Engineer",
    );
  });

  it("leaves the job queued when a criterion (e.g. no categories) is missing", async () => {
    const { service, jobsService, emailService } = makeService({
      job: { ...baseJob, categories: [] },
    });

    await service.handleWebhookEvent(Buffer.from(""), "sig");

    expect(jobsService.approveForReview).not.toHaveBeenCalled();
    expect(emailService.sendJobSubmittedEmail).toHaveBeenCalled();
  });

  it("leaves the job queued when its text contains a JOB_BANNED_KEYWORDS entry (PB44 AC2.1)", async () => {
    const { service, jobsService, emailService, config } = makeService({
      job: {
        ...baseJob,
        description: `Casino promo role. ${baseJob.description}`,
      },
    });
    config.get.mockImplementation((key: string) =>
      key === "JOB_BANNED_KEYWORDS" ? "casino, gambling" : "whsec_test",
    );

    await service.handleWebhookEvent(Buffer.from(""), "sig");

    expect(jobsService.approveForReview).not.toHaveBeenCalled();
    expect(emailService.sendJobSubmittedEmail).toHaveBeenCalled();
  });

  it("does nothing when the job was already handled (markJobPaidAndSubmitted returns null)", async () => {
    const { service, jobsService, emailService } = makeService({ job: null });

    await service.handleWebhookEvent(Buffer.from(""), "sig");

    expect(jobsService.approveForReview).not.toHaveBeenCalled();
    expect(emailService.sendJobLiveEmail).not.toHaveBeenCalled();
    expect(emailService.sendJobSubmittedEmail).not.toHaveBeenCalled();
  });
});

// Covers the gap where markJobPaidAndSubmitted and the conditional
// approveForReview in handleWebhookEvent above are two separate, non-atomic
// writes — a crash (or thrown error) between them leaves a job stuck
// planPaid:true, status:PENDING_REVIEW forever, since a Stripe retry's
// markJobPaidAndSubmitted call sees planPaid already true and no-ops.
describe("BillingService.reconcileStuckJobs", () => {
  const stuckJob = {
    id: "job-1",
    title: "Backend Engineer",
    slug: "backend-engineer",
    description: "x".repeat(100),
    salaryMin: 1000,
    categories: [{ categoryId: "cat-1" }],
    employer: { isVerified: true, user: { email: "employer@acme.com" } },
  };

  const makeService = ({
    stuckJobs,
    approveForReview = jest.fn().mockResolvedValue({ status: "ACTIVE" }),
  }: {
    stuckJobs: (typeof stuckJob)[];
    approveForReview?: jest.Mock;
  }) => {
    const billingRepository = {
      findStuckPaidJobs: jest.fn().mockResolvedValue(stuckJobs),
    };
    const emailService = {
      sendJobLiveEmail: jest.fn().mockResolvedValue(undefined),
    };
    const jobsService = { approveForReview };
    const service = new BillingService(
      {} as never,
      billingRepository as never,
      emailService as never,
      { get: jest.fn() } as never,
      jobsService as never,
    );
    return { service, billingRepository, jobsService, emailService };
  };

  it("approves an eligible stuck job and sends the live email", async () => {
    const { service, jobsService, emailService } = makeService({
      stuckJobs: [stuckJob],
    });

    const result = await service.reconcileStuckJobs();

    expect(jobsService.approveForReview).toHaveBeenCalledWith("job-1");
    expect(emailService.sendJobLiveEmail).toHaveBeenCalledWith(
      "employer@acme.com",
      "Backend Engineer",
      "backend-engineer",
    );
    expect(result).toEqual({ checked: 1, approved: 1 });
  });

  it("leaves a stuck job alone (and never calls approveForReview) when it isn't actually auto-approval-eligible", async () => {
    const { service, jobsService, emailService } = makeService({
      stuckJobs: [
        { ...stuckJob, employer: { ...stuckJob.employer, isVerified: false } },
      ],
    });

    const result = await service.reconcileStuckJobs();

    expect(jobsService.approveForReview).not.toHaveBeenCalled();
    expect(emailService.sendJobLiveEmail).not.toHaveBeenCalled();
    expect(result).toEqual({ checked: 1, approved: 0 });
  });

  it("skips the email when approveForReview's own CAS finds the job already moved on", async () => {
    const { service, emailService } = makeService({
      stuckJobs: [stuckJob],
      approveForReview: jest.fn().mockResolvedValue(null),
    });

    const result = await service.reconcileStuckJobs();

    expect(emailService.sendJobLiveEmail).not.toHaveBeenCalled();
    expect(result).toEqual({ checked: 1, approved: 0 });
  });

  it("skips a run that starts while a previous one on this instance is still in progress", async () => {
    let resolveFindStuckPaidJobs!: (jobs: (typeof stuckJob)[]) => void;
    const billingRepository = {
      findStuckPaidJobs: jest.fn(
        () =>
          new Promise<(typeof stuckJob)[]>((resolve) => {
            resolveFindStuckPaidJobs = resolve;
          }),
      ),
    };
    const service = new BillingService(
      {} as never,
      billingRepository as never,
      { sendJobLiveEmail: jest.fn() } as never,
      { get: jest.fn() } as never,
      { approveForReview: jest.fn() } as never,
    );

    const first = service.reconcileStuckJobs();
    const secondResult = await service.reconcileStuckJobs();

    expect(secondResult).toEqual({ checked: 0, approved: 0 });
    expect(billingRepository.findStuckPaidJobs).toHaveBeenCalledTimes(1);

    resolveFindStuckPaidJobs([]);
    await expect(first).resolves.toEqual({ checked: 0, approved: 0 });
  });
});
