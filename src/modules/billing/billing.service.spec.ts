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
