import { ApplicationsService } from "./applications.service";
import type { ApplicationsRepository } from "./applications.repository";
import { applySchema } from "./dto/apply.dto";
import { offerResponseSchema } from "./dto/offer-response.dto";
import {
  BadRequestApiException,
  ConflictApiException,
} from "@/common/exceptions/api.exception";

// runInBackground fire-and-forget: let the queued tasks settle.
const flushBackground = () => new Promise((resolve) => setImmediate(resolve));

const makeService = (repoOverrides: Partial<ApplicationsRepository> = {}) => {
  const repo = { ...repoOverrides } as unknown as ApplicationsRepository;
  const email = {
    sendApplicationReceivedEmail: jest.fn().mockResolvedValue(undefined),
  };
  const notifications = { create: jest.fn().mockResolvedValue(undefined) };
  const config = { get: jest.fn().mockReturnValue("https://cdn.example.com") };
  return {
    service: new ApplicationsService(
      repo,
      email as never,
      notifications as never,
      config as never,
    ),
    repo,
    email,
    notifications,
  };
};

const createdApplication = { id: "app-1", status: "PENDING" };
const job = {
  id: "job-1",
  title: "Backend Engineer",
  employer: {
    userId: "employer-user-1",
    user: { email: "owner@acme.example" },
  },
};

const applyRepo = (overrides: Partial<ApplicationsRepository> = {}) => ({
  findTalentWithUserName: jest
    .fn()
    .mockResolvedValue({ id: "talent-1", user: { name: "Jane Talent" } }),
  findJobForApply: jest
    .fn()
    .mockResolvedValue({ status: "ACTIVE", expiresAt: null }),
  findByJobAndTalent: jest.fn().mockResolvedValue(null),
  createAndIncrementApplyCount: jest
    .fn()
    .mockResolvedValue({ application: createdApplication, job }),
  ...overrides,
});

describe("ApplicationsService.apply (PB53 / PB73)", () => {
  it("stores the contact phone with the application", async () => {
    const { service, repo } = makeService(applyRepo());

    await service.apply("user-1", {
      jobId: "job-1",
      coverLetter: "Hello",
      contactPhone: "+84 912 345 678",
    });

    expect(repo.createAndIncrementApplyCount).toHaveBeenCalledWith({
      jobId: "job-1",
      talentId: "talent-1",
      coverLetter: "Hello",
      resumeUrl: undefined,
      contactPhone: "+84 912 345 678",
    });
  });

  it("creates the employer's in-app APPLICATION_RECEIVED notification and e-mails them", async () => {
    const { service, notifications, email } = makeService(applyRepo());

    await service.apply("user-1", { jobId: "job-1" });
    await flushBackground();

    expect(notifications.create).toHaveBeenCalledWith({
      userId: "employer-user-1",
      type: "APPLICATION_RECEIVED",
      title: "New application received",
      body: "Jane Talent applied to Backend Engineer.",
      link: "/employer-dashboard/applications/app-1",
    });
    expect(email.sendApplicationReceivedEmail).toHaveBeenCalledWith(
      "owner@acme.example",
      "Backend Engineer",
      "Jane Talent",
    );
  });

  it("does not notify anyone when the duplicate check stops the apply", async () => {
    const { service, notifications } = makeService(
      applyRepo({
        findByJobAndTalent: jest.fn().mockResolvedValue({ id: "existing" }),
      }),
    );

    await expect(
      service.apply("user-1", { jobId: "job-1" }),
    ).rejects.toBeInstanceOf(ConflictApiException);
    await flushBackground();
    expect(notifications.create).not.toHaveBeenCalled();
  });
});

describe("ApplicationsService.respondToOffer (PB56)", () => {
  const offered = { id: "app-1", status: "OFFERED" };
  const parties = {
    id: "app-1",
    talent: { userId: "talent-user-1", user: { name: "Jane Talent" } },
    job: {
      title: "Backend Engineer",
      employerId: "company-1",
      employer: { userId: "employer-user-1", companyName: "Acme" },
    },
  };
  const offerRepo = (overrides: Partial<ApplicationsRepository> = {}) => ({
    findTalentIdByUserId: jest.fn().mockResolvedValue({ id: "talent-1" }),
    findByIdForTalent: jest.fn().mockResolvedValue(offered),
    respondToOffer: jest
      .fn()
      .mockResolvedValue({ ...offered, status: "OFFER_DECLINED" }),
    findPartiesById: jest.fn().mockResolvedValue(parties),
    ...overrides,
  });

  it("stores the decline reason and passes it on to the employer", async () => {
    const { service, repo, notifications } = makeService(offerRepo());

    await service.respondToOffer("user-1", "app-1", {
      response: "DECLINED",
      reason: "I accepted another offer.",
    });
    await flushBackground();

    expect(repo.respondToOffer).toHaveBeenCalledWith(
      "app-1",
      "talent-1",
      "OFFER_DECLINED",
      "I accepted another offer.",
    );
    expect(notifications.create).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "employer-user-1",
        type: "OFFER_DECLINED",
        body: "Jane Talent declined your offer for Backend Engineer. Reason: I accepted another offer.",
      }),
    );
  });

  it("accepts without a reason", async () => {
    const { service, repo } = makeService(
      offerRepo({
        respondToOffer: jest
          .fn()
          .mockResolvedValue({ ...offered, status: "OFFER_ACCEPTED" }),
      }),
    );

    await service.respondToOffer("user-1", "app-1", { response: "ACCEPTED" });

    expect(repo.respondToOffer).toHaveBeenCalledWith(
      "app-1",
      "talent-1",
      "OFFER_ACCEPTED",
      undefined,
    );
  });

  // PB56 BR1: the response is final.
  it("refuses a second response once the offer was answered", async () => {
    const { service, repo } = makeService(
      offerRepo({
        findByIdForTalent: jest
          .fn()
          .mockResolvedValue({ ...offered, status: "OFFER_ACCEPTED" }),
      }),
    );

    await expect(
      service.respondToOffer("user-1", "app-1", {
        response: "DECLINED",
        reason: "Changed my mind",
      }),
    ).rejects.toBeInstanceOf(BadRequestApiException);
    expect(repo.respondToOffer).not.toHaveBeenCalled();
  });
});

describe("applySchema (PB53 AC2)", () => {
  const base = { jobId: "cjob1a2b0000ug0h9x1n1a2" };

  it.each([
    "+84 912 345 678",
    "0912345678",
    "(028) 3822-1234",
    "+1.415.555.0100",
  ])("accepts the phone number %s", (contactPhone) => {
    expect(applySchema.safeParse({ ...base, contactPhone }).success).toBe(true);
  });

  it.each(["12345", "call me", "+84 912 345 678 999 999", "091-ABC-1234"])(
    "rejects the phone number %s",
    (contactPhone) => {
      expect(applySchema.safeParse({ ...base, contactPhone }).success).toBe(
        false,
      );
    },
  );
});

describe("offerResponseSchema (PB56 AC4)", () => {
  it("requires a non-blank reason to decline", () => {
    expect(
      offerResponseSchema.safeParse({ response: "DECLINED" }).success,
    ).toBe(false);
    expect(
      offerResponseSchema.safeParse({ response: "DECLINED", reason: "   " })
        .success,
    ).toBe(false);
    expect(
      offerResponseSchema.safeParse({
        response: "DECLINED",
        reason: "Relocation not possible",
      }).success,
    ).toBe(true);
  });

  it("accepts without a reason", () => {
    expect(
      offerResponseSchema.safeParse({ response: "ACCEPTED" }).success,
    ).toBe(true);
  });
});
