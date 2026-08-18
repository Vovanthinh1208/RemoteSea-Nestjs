import { EmployerService } from "./employer.service";
import {
  BadRequestApiException,
  ConflictApiException,
  NotFoundApiException,
} from "@/common/exceptions/api.exception";
import { ErrorCode } from "@/common/exceptions/error-codes";
import type { EmployerRepository } from "./employer.repository";
import type { ApplicationWithJobOwner } from "./guards/application-ownership.guard";

// Ownership is enforced upstream by ApplicationOwnershipGuard — these tests cover
// only what's left in the service: the ALLOWED_TRANSITIONS validation and the
// concurrent-update conflict path.

const application = {
  id: "app-1",
  status: "PENDING",
  talent: { userId: "talent-user-1" },
  job: { title: "Engineer", employer: { userId: "owner-1" } },
} as unknown as ApplicationWithJobOwner;

const makeService = (
  repoOverrides: Partial<EmployerRepository> = {},
  emailServiceOverrides: Record<string, jest.Mock> = {},
) => {
  const repo = {
    updateApplication: jest.fn(),
    ...repoOverrides,
  } as unknown as EmployerRepository;
  const emailService = {
    sendEmployerVerificationEmail: jest.fn().mockResolvedValue(undefined),
    ...emailServiceOverrides,
  };
  const notificationsService = {
    create: jest.fn().mockResolvedValue(undefined),
  };
  // No-op cache (always a miss, set() does nothing) — fine for every
  // existing test in this file since none of them exercise the cached
  // getPublicResponseHours path, which builds its own cache stub instead.
  const cache = { get: jest.fn().mockResolvedValue(undefined), set: jest.fn() };
  const service = new EmployerService(
    repo,
    {} as never,
    {} as never,
    emailService as never,
    notificationsService as never,
    cache as never,
  );
  return { service, repo, emailService, notificationsService, cache };
};

describe("EmployerService.updateApplication", () => {
  it("allows a valid transition (PENDING -> REVIEWING) and notifies the talent", async () => {
    const updated = { ...application, status: "REVIEWING" };
    const { service, repo, notificationsService } = makeService({
      updateApplication: jest.fn().mockResolvedValue(updated),
    });

    const result = await service.updateApplication(application, {
      status: "REVIEWING",
    });
    expect(repo.updateApplication).toHaveBeenCalledWith(
      "app-1",
      "PENDING",
      "REVIEWING",
      undefined,
    );
    expect(result).toBe(updated);
    expect(notificationsService.create).toHaveBeenCalledWith({
      userId: "talent-user-1",
      type: "APPLICATION_STATUS_CHANGED",
      title: "Your application status changed",
      body: "Your application for Engineer is now In review.",
      link: "/talent",
    });
  });

  it("rejects an invalid transition (PENDING -> OFFERED)", async () => {
    const { service } = makeService();

    await expect(
      service.updateApplication(application, { status: "OFFERED" }),
    ).rejects.toBeInstanceOf(BadRequestApiException);
  });

  it("allows a no-op status update (same status, e.g. notes-only edit) without notifying", async () => {
    const updated = { ...application };
    const { service, repo, notificationsService } = makeService({
      updateApplication: jest.fn().mockResolvedValue(updated),
    });

    await service.updateApplication(application, {
      status: "PENDING",
      notes: "left a note",
    });
    expect(repo.updateApplication).toHaveBeenCalledWith(
      "app-1",
      "PENDING",
      "PENDING",
      "left a note",
    );
    expect(notificationsService.create).not.toHaveBeenCalled();
  });

  it("throws Conflict when the row was updated concurrently", async () => {
    const { service } = makeService({
      updateApplication: jest.fn().mockResolvedValue(null),
    });

    await expect(
      service.updateApplication(application, { status: "REVIEWING" }),
    ).rejects.toBeInstanceOf(ConflictApiException);
  });
});

describe("EmployerService.submitVerification", () => {
  const profile = {
    id: "emp-1",
    companyName: "Acme Inc",
    websiteUrl: "https://acme.com",
  };

  it("rejects when no websiteUrl is on file", async () => {
    const { service } = makeService({
      findProfileForVerification: jest
        .fn()
        .mockResolvedValue({ ...profile, websiteUrl: null }),
    });

    await expect(
      service.submitVerification("user-1", { email: "jane@acme.com" }),
    ).rejects.toBeInstanceOf(BadRequestApiException);
  });

  it("rejects when the email domain doesn't match the website", async () => {
    const { service, repo } = makeService({
      findProfileForVerification: jest.fn().mockResolvedValue(profile),
      createEmailVerification: jest.fn(),
    });

    await expect(
      service.submitVerification("user-1", { email: "jane@other.com" }),
    ).rejects.toBeInstanceOf(BadRequestApiException);
    expect(repo.createEmailVerification).not.toHaveBeenCalled();
  });

  it("accepts a matching domain (ignoring www.) and sends the email", async () => {
    const { service, repo, emailService } = makeService({
      findProfileForVerification: jest
        .fn()
        .mockResolvedValue({ ...profile, websiteUrl: "https://www.acme.com" }),
      createEmailVerification: jest.fn().mockResolvedValue(undefined),
    });

    await service.submitVerification("user-1", { email: "jane@acme.com" });

    expect(repo.createEmailVerification).toHaveBeenCalledWith(
      "emp-1",
      "jane@acme.com",
      expect.any(String),
      expect.any(Date),
    );
    expect(emailService.sendEmployerVerificationEmail).toHaveBeenCalledWith(
      "jane@acme.com",
      "Acme Inc",
      expect.any(String),
    );
  });
});

describe("EmployerService.confirmVerification", () => {
  it("rejects an unknown token", async () => {
    const { service } = makeService({
      findEmailVerificationByToken: jest.fn().mockResolvedValue(null),
    });

    await expect(
      service.confirmVerification({ token: "bogus" }),
    ).rejects.toBeInstanceOf(BadRequestApiException);
  });

  it("rejects an already-consumed token", async () => {
    const { service } = makeService({
      findEmailVerificationByToken: jest.fn().mockResolvedValue({
        id: "ver-1",
        employerId: "emp-1",
        consumedAt: new Date(),
        expiresAt: new Date(Date.now() + 10_000),
      }),
    });

    await expect(
      service.confirmVerification({ token: "used" }),
    ).rejects.toBeInstanceOf(BadRequestApiException);
  });

  it("marks the employer FAILED and rejects an expired token", async () => {
    const { service, repo } = makeService({
      findEmailVerificationByToken: jest.fn().mockResolvedValue({
        id: "ver-1",
        employerId: "emp-1",
        consumedAt: null,
        expiresAt: new Date(Date.now() - 10_000),
      }),
      markVerificationFailed: jest.fn().mockResolvedValue(undefined),
    });

    await expect(
      service.confirmVerification({ token: "expired" }),
    ).rejects.toBeInstanceOf(BadRequestApiException);
    expect(repo.markVerificationFailed).toHaveBeenCalledWith("emp-1");
  });

  it("consumes a valid token and verifies the employer", async () => {
    const { service, repo } = makeService({
      findEmailVerificationByToken: jest.fn().mockResolvedValue({
        id: "ver-1",
        employerId: "emp-1",
        consumedAt: null,
        expiresAt: new Date(Date.now() + 10_000),
      }),
      consumeEmailVerification: jest.fn().mockResolvedValue(true),
    });

    await service.confirmVerification({ token: "good" });
    expect(repo.consumeEmailVerification).toHaveBeenCalledWith(
      "ver-1",
      "emp-1",
    );
  });

  it("rejects when consumeEmailVerification loses the race (already consumed concurrently)", async () => {
    const { service } = makeService({
      findEmailVerificationByToken: jest.fn().mockResolvedValue({
        id: "ver-1",
        employerId: "emp-1",
        consumedAt: null,
        expiresAt: new Date(Date.now() + 10_000),
      }),
      consumeEmailVerification: jest.fn().mockResolvedValue(false),
    });

    await expect(
      service.confirmVerification({ token: "raced" }),
    ).rejects.toBeInstanceOf(BadRequestApiException);
  });
});

describe("EmployerService.getPublicResponseHours", () => {
  it("returns null below the minimum sample size", async () => {
    const { service } = makeService({
      getPublicResponseStats: jest
        .fn()
        .mockResolvedValue({ avgHours: 4, respondedCount: 2 }),
    });

    await expect(service.getPublicResponseHours("emp-1")).resolves.toBeNull();
  });

  it("returns the average once the sample size floor is met", async () => {
    const { service } = makeService({
      getPublicResponseStats: jest
        .fn()
        .mockResolvedValue({ avgHours: 18.5, respondedCount: 3 }),
    });

    await expect(service.getPublicResponseHours("emp-1")).resolves.toBe(18.5);
  });

  it("caches the underlying stats so a second call doesn't re-query", async () => {
    const getPublicResponseStats = jest
      .fn()
      .mockResolvedValue({ avgHours: 10, respondedCount: 5 });
    const { service, cache } = makeService({ getPublicResponseStats });

    await service.getPublicResponseHours("emp-1");
    // Simulate the cache now holding the value getOrSetCache would have set.
    cache.get.mockResolvedValueOnce({ avgHours: 10, respondedCount: 5 });
    await service.getPublicResponseHours("emp-1");

    expect(getPublicResponseStats).toHaveBeenCalledTimes(1);
  });
});

describe("EmployerService.getPublicCompanyProfile", () => {
  it("throws EMPLOYER_PROFILE_NOT_FOUND for an unknown slug", async () => {
    const { service } = makeService({
      findPublicProfileBySlug: jest.fn().mockResolvedValue(null),
    });

    const error = await service
      .getPublicCompanyProfile("nonexistent")
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(NotFoundApiException);
    expect((error as NotFoundApiException).getResponse()).toMatchObject({
      code: ErrorCode.EMPLOYER_PROFILE_NOT_FOUND,
    });
  });

  it("composes the profile, stats, jobs, and response-time signal for a known slug", async () => {
    const { service } = makeService({
      findPublicProfileBySlug: jest.fn().mockResolvedValue({
        id: "emp-1",
        companyName: "Acme",
        slug: "acme",
      }),
      getPublicCompanyStats: jest
        .fn()
        .mockResolvedValue({ activeJobCount: 2, vnHireTotal: 5 }),
      findActiveJobsForCompany: jest.fn().mockResolvedValue([{ id: "job-1" }]),
      getPublicResponseStats: jest
        .fn()
        .mockResolvedValue({ avgHours: 12, respondedCount: 4 }),
    });

    const result = await service.getPublicCompanyProfile("acme");

    expect(result).toMatchObject({
      id: "emp-1",
      companyName: "Acme",
      activeJobCount: 2,
      vnHireTotal: 5,
      avgFirstResponseHours: 12,
      jobs: [{ id: "job-1" }],
    });
  });
});
