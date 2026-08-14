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
    return { service, jobsService, emailService };
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

  it("does nothing when the job was already handled (markJobPaidAndSubmitted returns null)", async () => {
    const { service, jobsService, emailService } = makeService({ job: null });

    await service.handleWebhookEvent(Buffer.from(""), "sig");

    expect(jobsService.approveForReview).not.toHaveBeenCalled();
    expect(emailService.sendJobLiveEmail).not.toHaveBeenCalled();
    expect(emailService.sendJobSubmittedEmail).not.toHaveBeenCalled();
  });
});
