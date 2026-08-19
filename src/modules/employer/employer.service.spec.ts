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
  talent: {
    userId: "talent-user-1",
    user: { name: "Jane Talent", email: "jane@example.com" },
  },
  job: { title: "Engineer", employerId: "owner-1-company" },
} as unknown as ApplicationWithJobOwner;

const makeService = (
  repoOverrides: Partial<EmployerRepository> = {},
  emailServiceOverrides: Record<string, jest.Mock> = {},
  companyMembershipOverrides: Record<string, jest.Mock> = {},
) => {
  const repo = {
    updateApplication: jest.fn(),
    // Default "on" (matches the schema default for an absent preference
    // row) so every test not specifically about this gating doesn't also
    // have to stub it.
    applicationUpdatesEnabled: jest.fn().mockResolvedValue(true),
    findApplicationUpdatesPreferences: jest.fn().mockResolvedValue(new Map()),
    ...repoOverrides,
  } as unknown as EmployerRepository;
  // "owner-1" resolves to owner-1-company/OWNER by default — matches every
  // existing fixture below that used to compare against callerId "owner-1"
  // directly, before ownership became company-scoped.
  const companyMembershipService = {
    resolveMembership: jest
      .fn()
      .mockResolvedValue({ employerId: "owner-1-company", role: "OWNER" }),
    ...companyMembershipOverrides,
  };
  const emailService = {
    sendEmployerVerificationEmail: jest.fn().mockResolvedValue(undefined),
    sendApplicationStatusChangedEmail: jest.fn().mockResolvedValue(undefined),
    ...emailServiceOverrides,
  };
  const notificationsService = {
    create: jest.fn().mockResolvedValue(undefined),
  };
  const messagesService = {
    list: jest.fn(),
    send: jest.fn(),
  };
  const interviewsService = {
    get: jest.fn(),
    propose: jest.fn(),
  };
  const scorecardsService = {
    list: jest.fn(),
    create: jest.fn(),
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
    messagesService as never,
    interviewsService as never,
    scorecardsService as never,
    companyMembershipService as never,
    cache as never,
  );
  return {
    service,
    repo,
    emailService,
    notificationsService,
    messagesService,
    interviewsService,
    scorecardsService,
    companyMembershipService,
    cache,
  };
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
      link: "/applications/app-1",
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

  it("emails the talent when applicationUpdates is enabled", async () => {
    const updated = { ...application, status: "REVIEWING" };
    const { service, emailService } = makeService({
      updateApplication: jest.fn().mockResolvedValue(updated),
      applicationUpdatesEnabled: jest.fn().mockResolvedValue(true),
    });

    await service.updateApplication(application, { status: "REVIEWING" });

    expect(emailService.sendApplicationStatusChangedEmail).toHaveBeenCalledWith(
      "jane@example.com",
      "Jane Talent",
      "Engineer",
      "In review",
    );
  });

  it("skips the email (but still notifies in-app) when applicationUpdates is disabled", async () => {
    const updated = { ...application, status: "REVIEWING" };
    const { service, emailService, notificationsService } = makeService({
      updateApplication: jest.fn().mockResolvedValue(updated),
      applicationUpdatesEnabled: jest.fn().mockResolvedValue(false),
    });

    await service.updateApplication(application, { status: "REVIEWING" });

    expect(
      emailService.sendApplicationStatusChangedEmail,
    ).not.toHaveBeenCalled();
    // In-app notifications are a separate, always-on channel — the email
    // toggle above must not suppress this.
    expect(notificationsService.create).toHaveBeenCalled();
  });
});

describe("EmployerService.bulkUpdateApplications", () => {
  it("reports NOT_FOUND for an id that doesn't exist or isn't the caller's own", async () => {
    const { service, notificationsService } = makeService({
      findApplicationsForBulkUpdate: jest.fn().mockResolvedValue([
        {
          id: "app-2",
          status: "PENDING",
          talent: {
            userId: "talent-user-2",
            user: { name: "Talent Two", email: "talent2@example.com" },
          },
          job: { title: "Frontend Dev", employerId: "someone-elses-company" },
        },
      ]),
      bulkUpdateApplicationStatus: jest.fn().mockResolvedValue([]),
    });

    const result = await service.bulkUpdateApplications("owner-1", {
      ids: ["app-1", "app-2"],
      status: "REJECTED",
    });

    expect(result.updated).toEqual([]);
    expect(result.failed).toEqual([
      { id: "app-1", reason: "NOT_FOUND" },
      { id: "app-2", reason: "NOT_FOUND" },
    ]);
    expect(notificationsService.create).not.toHaveBeenCalled();
  });

  it("reports INVALID_TRANSITION for an id that can't reach the target status", async () => {
    const { service } = makeService({
      findApplicationsForBulkUpdate: jest.fn().mockResolvedValue([
        {
          id: "app-1",
          status: "REJECTED",
          talent: {
            userId: "talent-user-1",
            user: { name: "Jane Talent", email: "jane@example.com" },
          },
          job: { title: "Backend Dev", employerId: "owner-1-company" },
        },
      ]),
      bulkUpdateApplicationStatus: jest.fn().mockResolvedValue([]),
    });

    const result = await service.bulkUpdateApplications("owner-1", {
      ids: ["app-1"],
      status: "REJECTED",
    });

    expect(result.failed).toEqual([
      { id: "app-1", reason: "INVALID_TRANSITION" },
    ]);
  });

  it("reports STALE when the row moved between the fresh read and the write", async () => {
    const bulkUpdateApplicationStatus = jest.fn().mockResolvedValue([]);
    const { service } = makeService({
      findApplicationsForBulkUpdate: jest.fn().mockResolvedValue([
        {
          id: "app-1",
          status: "PENDING",
          talent: {
            userId: "talent-user-1",
            user: { name: "Jane Talent", email: "jane@example.com" },
          },
          job: { title: "Backend Dev", employerId: "owner-1-company" },
        },
      ]),
      bulkUpdateApplicationStatus,
    });

    const result = await service.bulkUpdateApplications("owner-1", {
      ids: ["app-1"],
      status: "REJECTED",
    });

    expect(bulkUpdateApplicationStatus).toHaveBeenCalledWith(
      [{ id: "app-1", expectedStatus: "PENDING" }],
      "REJECTED",
      undefined,
    );
    expect(result.failed).toEqual([{ id: "app-1", reason: "STALE" }]);
  });

  it("splits a mixed batch correctly and notifies only the successfully-updated talents", async () => {
    const { service, notificationsService } = makeService({
      findApplicationsForBulkUpdate: jest.fn().mockResolvedValue([
        {
          id: "app-1",
          status: "PENDING",
          talent: {
            userId: "talent-user-1",
            user: { name: "Talent One", email: "talent1@example.com" },
          },
          job: { title: "Backend Dev", employerId: "owner-1-company" },
        },
        {
          id: "app-2",
          status: "REVIEWING",
          talent: {
            userId: "talent-user-2",
            user: { name: "Talent Two", email: "talent2@example.com" },
          },
          job: { title: "Frontend Dev", employerId: "owner-1-company" },
        },
        {
          id: "app-3",
          status: "REJECTED",
          talent: {
            userId: "talent-user-3",
            user: { name: "Talent Three", email: "talent3@example.com" },
          },
          job: { title: "Design Lead", employerId: "owner-1-company" },
        },
      ]),
      bulkUpdateApplicationStatus: jest
        .fn()
        .mockResolvedValue(["app-1", "app-2"]),
    });

    const result = await service.bulkUpdateApplications("owner-1", {
      ids: ["app-1", "app-2", "app-3", "app-4"],
      status: "REJECTED",
    });

    expect(result.updated).toEqual(["app-1", "app-2"]);
    expect(result.failed).toEqual([
      { id: "app-3", reason: "INVALID_TRANSITION" },
      { id: "app-4", reason: "NOT_FOUND" },
    ]);
    expect(notificationsService.create).toHaveBeenCalledTimes(2);
    expect(notificationsService.create).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "talent-user-1" }),
    );
    expect(notificationsService.create).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "talent-user-2" }),
    );
  });

  it("emails only the talents with applicationUpdates enabled", async () => {
    const { service, emailService } = makeService({
      findApplicationsForBulkUpdate: jest.fn().mockResolvedValue([
        {
          id: "app-1",
          status: "PENDING",
          talent: {
            userId: "talent-user-1",
            user: { name: "Talent One", email: "talent1@example.com" },
          },
          job: { title: "Backend Dev", employerId: "owner-1-company" },
        },
        {
          id: "app-2",
          status: "PENDING",
          talent: {
            userId: "talent-user-2",
            user: { name: "Talent Two", email: "talent2@example.com" },
          },
          job: { title: "Frontend Dev", employerId: "owner-1-company" },
        },
      ]),
      bulkUpdateApplicationStatus: jest
        .fn()
        .mockResolvedValue(["app-1", "app-2"]),
      findApplicationUpdatesPreferences: jest
        .fn()
        .mockResolvedValue(new Map([["talent-user-2", false]])),
    });

    await service.bulkUpdateApplications("owner-1", {
      ids: ["app-1", "app-2"],
      status: "REVIEWING",
    });

    expect(
      emailService.sendApplicationStatusChangedEmail,
    ).toHaveBeenCalledTimes(1);
    expect(emailService.sendApplicationStatusChangedEmail).toHaveBeenCalledWith(
      "talent1@example.com",
      "Talent One",
      "Backend Dev",
      "In review",
    );
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

describe("EmployerService.listApplicationMessages / sendApplicationMessage", () => {
  it("delegates listing to MessagesService", async () => {
    const { service, messagesService } = makeService();
    messagesService.list.mockResolvedValue({
      messages: [{ id: "m1" }],
      jobTitle: "Engineer",
      employerName: "Acme",
      talentName: "Talent One",
    });

    const result = await service.listApplicationMessages(application);

    expect(messagesService.list).toHaveBeenCalledWith(application);
    expect(result).toEqual({
      messages: [{ id: "m1" }],
      jobTitle: "Engineer",
      employerName: "Acme",
      talentName: "Talent One",
    });
  });

  it("delegates sending to MessagesService", async () => {
    const { service, messagesService } = makeService();
    messagesService.send.mockResolvedValue({ id: "m2" });

    const result = await service.sendApplicationMessage(
      application,
      "owner-1",
      { body: "hi" },
    );

    expect(messagesService.send).toHaveBeenCalledWith(application, "owner-1", {
      body: "hi",
    });
    expect(result).toEqual({ id: "m2" });
  });
});

describe("EmployerService.getApplicationInterview / proposeInterview", () => {
  it("delegates getting to InterviewsService", async () => {
    const { service, interviewsService } = makeService();
    interviewsService.get.mockResolvedValue({
      interview: null,
      jobTitle: "Engineer",
      employerName: "Acme",
      talentName: "Talent One",
    });

    const result = await service.getApplicationInterview(application);

    expect(interviewsService.get).toHaveBeenCalledWith(application);
    expect(result).toEqual({
      interview: null,
      jobTitle: "Engineer",
      employerName: "Acme",
      talentName: "Talent One",
    });
  });

  it("delegates proposing to InterviewsService", async () => {
    const { service, interviewsService } = makeService();
    interviewsService.propose.mockResolvedValue({ id: "intv-1" });

    const dto = {
      durationMinutes: 30,
      proposedSlots: ["2026-08-25T07:00:00.000Z"],
    };
    const result = await service.proposeInterview(application, dto);

    expect(interviewsService.propose).toHaveBeenCalledWith(application, dto);
    expect(result).toEqual({ id: "intv-1" });
  });
});
