import { EmployerService } from "./employer.service";
import {
  BadRequestApiException,
  ConflictApiException,
  NotFoundApiException,
} from "@/common/exceptions/api.exception";
import { ErrorCode } from "@/common/exceptions/error-codes";
import type { EmployerRepository } from "./employer.repository";
import { hashVerificationCode } from "./verification.util";
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
    getIcsFile: jest.fn(),
    propose: jest.fn(),
    listUpcomingForCompany: jest.fn(),
  };
  const scorecardsService = {
    list: jest.fn(),
    create: jest.fn(),
  };
  const commentsService = {
    list: jest.fn(),
    create: jest.fn(),
  };
  // Only exportJobApplicantsCsv reads this (FRONTEND_URL, for the public
  // profile link column) — every other test in this file never touches
  // config at all, so one fixed fake value is fine as a shared default.
  const config = { get: jest.fn().mockReturnValue("https://remotesea.io") };
  // No-op cache (always a miss, set() does nothing) — fine for every
  // existing test in this file since none of them exercise the cached
  // getPublicResponseHours path, which builds its own cache stub instead.
  const cache = { get: jest.fn().mockResolvedValue(undefined), set: jest.fn() };
  const service = new EmployerService(
    repo,
    config as never,
    {} as never,
    emailService as never,
    notificationsService as never,
    messagesService as never,
    interviewsService as never,
    scorecardsService as never,
    commentsService as never,
    {} as never,
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
    commentsService,
    companyMembershipService,
    config,
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
      {},
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
      {},
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
      undefined,
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

  // PB58 BR2: rejection feedback is stored for, and sent to, the talent.
  it("stores the rejection reason and includes it in the notification and email", async () => {
    const updated = { ...application, status: "REJECTED" };
    const { service, repo, notificationsService, emailService } = makeService({
      updateApplication: jest.fn().mockResolvedValue(updated),
      applicationUpdatesEnabled: jest.fn().mockResolvedValue(true),
    });

    await service.updateApplication(application, {
      status: "REJECTED",
      reason: "We went with a candidate with more Go experience.",
    });

    expect(repo.updateApplication).toHaveBeenCalledWith(
      "app-1",
      "PENDING",
      "REJECTED",
      undefined,
      { rejectionReason: "We went with a candidate with more Go experience." },
    );
    expect(notificationsService.create).toHaveBeenCalledWith(
      expect.objectContaining({
        body: "Your application for Engineer is now Rejected. Feedback: We went with a candidate with more Go experience.",
      }),
    );
    expect(emailService.sendApplicationStatusChangedEmail).toHaveBeenCalledWith(
      "jane@example.com",
      "Jane Talent",
      "Engineer",
      "Rejected",
      "We went with a candidate with more Go experience.",
    );
  });

  it("rejects a reason sent with a non-REJECTED status", async () => {
    const { service, repo } = makeService();

    const error = await service
      .updateApplication(application, { status: "REVIEWING", reason: "x" })
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(BadRequestApiException);
    expect(repo.updateApplication).not.toHaveBeenCalled();
  });

  // PB56 AC1–2: an offer must carry salary, benefits and start date.
  describe("extending an offer (INTERVIEW -> OFFERED)", () => {
    const atInterview = { ...application, status: "INTERVIEW" as const };
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);

    it("requires the offer details", async () => {
      const { service, repo } = makeService();

      const error = await service
        .updateApplication(atInterview, { status: "OFFERED" })
        .catch((e: unknown) => e);

      expect(error).toBeInstanceOf(BadRequestApiException);
      expect((error as BadRequestApiException).getResponse()).toMatchObject({
        code: ErrorCode.OFFER_DETAILS_REQUIRED,
      });
      expect(repo.updateApplication).not.toHaveBeenCalled();
    });

    it("rejects a start date in the past", async () => {
      const { service, repo } = makeService();

      const error = await service
        .updateApplication(atInterview, {
          status: "OFFERED",
          offer: {
            salary: "USD 4,000/month",
            benefits: "Remote stipend",
            startDate: "2020-01-01",
          },
        })
        .catch((e: unknown) => e);

      expect(error).toBeInstanceOf(BadRequestApiException);
      expect(repo.updateApplication).not.toHaveBeenCalled();
    });

    it("stores the offer in the same CAS update as the status", async () => {
      const { service, repo } = makeService({
        updateApplication: jest
          .fn()
          .mockResolvedValue({ ...atInterview, status: "OFFERED" }),
      });

      await service.updateApplication(atInterview, {
        status: "OFFERED",
        offer: {
          salary: "USD 4,000/month",
          benefits: "Remote stipend, 20 days PTO",
          startDate: tomorrow,
        },
      });

      expect(repo.updateApplication).toHaveBeenCalledWith(
        "app-1",
        "INTERVIEW",
        "OFFERED",
        undefined,
        {
          offerSalary: "USD 4,000/month",
          offerBenefits: "Remote stipend, 20 days PTO",
          offerStartDate: new Date(`${tomorrow}T00:00:00Z`),
        },
      );
    });

    it("rejects offer details sent with a non-OFFERED status", async () => {
      const { service } = makeService();

      await expect(
        service.updateApplication(application, {
          status: "REVIEWING",
          offer: { salary: "x", benefits: "y", startDate: tomorrow },
        }),
      ).rejects.toBeInstanceOf(BadRequestApiException);
    });
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
          status: "PENDING",
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
      status: "SHORTLISTED",
    });

    expect(result.failed).toEqual([
      { id: "app-1", reason: "INVALID_TRANSITION" },
    ]);
  });

  // PB59 BR1: end-state applications (WITHDRAWN, HIRED = OFFER_ACCEPTED, …)
  // are skipped, not reported as failures, and never written.
  it.each(["WITHDRAWN", "OFFER_ACCEPTED", "OFFER_DECLINED", "REJECTED"])(
    "skips an application that is already %s",
    async (status) => {
      const bulkUpdateApplicationStatus = jest.fn().mockResolvedValue([]);
      const { service, notificationsService } = makeService({
        findApplicationsForBulkUpdate: jest.fn().mockResolvedValue([
          {
            id: "app-1",
            status,
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

      expect(result).toEqual({ updated: [], skipped: ["app-1"], failed: [] });
      expect(bulkUpdateApplicationStatus).toHaveBeenCalledWith(
        [],
        "REJECTED",
        undefined,
        undefined,
      );
      expect(notificationsService.create).not.toHaveBeenCalled();
    },
  );

  it("refuses a bulk move to OFFERED (offers need per-candidate details)", async () => {
    const { service, repo } = makeService({
      findApplicationsForBulkUpdate: jest.fn(),
    });

    const error = await service
      .bulkUpdateApplications("owner-1", { ids: ["app-1"], status: "OFFERED" })
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(BadRequestApiException);
    expect((error as BadRequestApiException).getResponse()).toMatchObject({
      code: ErrorCode.OFFER_DETAILS_REQUIRED,
    });
    expect(repo.findApplicationsForBulkUpdate).not.toHaveBeenCalled();
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
    // app-3 is already REJECTED — skipped (PB59 BR1), not a failure.
    expect(result.skipped).toEqual(["app-3"]);
    expect(result.failed).toEqual([{ id: "app-4", reason: "NOT_FOUND" }]);
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
      undefined,
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
      title: "Round 1 - Technical",
      platform: "ZOOM" as const,
      meetingUrl: "https://zoom.us/j/123",
      durationMinutes: 30,
      proposedSlots: ["2026-08-25T07:00:00.000Z"],
    };
    const result = await service.proposeInterview(application, dto);

    expect(interviewsService.propose).toHaveBeenCalledWith(application, dto);
    expect(result).toEqual({ id: "intv-1" });
  });
});

// Pure delegation — the "mine vs team" business rule itself is owned and
// tested entirely by InterviewsService.listUpcomingForCompany (see
// interviews.service.spec.ts); these tests only cover that the right
// membership args reach it and its result passes straight through
// unmodified, same shape as the getApplicationInterview/proposeInterview
// delegation tests above.
describe("EmployerService.listUpcomingInterviews", () => {
  it("resolves the caller's membership and passes it through to InterviewsService, returning its result unmodified", async () => {
    const { service, interviewsService } = makeService();
    interviewsService.listUpcomingForCompany.mockResolvedValue({
      scope: "team",
      interviews: [{ id: "intv-1" }],
    });

    const result = await service.listUpcomingInterviews("owner-1");

    expect(interviewsService.listUpcomingForCompany).toHaveBeenCalledWith(
      "owner-1-company",
      "OWNER",
      "owner-1",
    );
    expect(result).toEqual({ scope: "team", interviews: [{ id: "intv-1" }] });
  });

  it("passes an INTERVIEWER caller's own role and id through unchanged", async () => {
    const { service, interviewsService, companyMembershipService } =
      makeService(
        {},
        {},
        {
          resolveMembership: jest.fn().mockResolvedValue({
            employerId: "owner-1-company",
            role: "INTERVIEWER",
          }),
        },
      );
    interviewsService.listUpcomingForCompany.mockResolvedValue({
      scope: "mine",
      interviews: [],
    });

    await service.listUpcomingInterviews("interviewer-1");

    expect(companyMembershipService.resolveMembership).toHaveBeenCalledWith(
      "interviewer-1",
    );
    expect(interviewsService.listUpcomingForCompany).toHaveBeenCalledWith(
      "owner-1-company",
      "INTERVIEWER",
      "interviewer-1",
    );
  });

  it("rejects a caller with no company membership", async () => {
    const { service } = makeService(
      {},
      {},
      {
        resolveMembership: jest.fn().mockResolvedValue(null),
      },
    );

    await expect(
      service.listUpcomingInterviews("no-membership-user"),
    ).rejects.toThrow();
  });
});

// Backs the dashboard's "Recent applicants" panel — replaced N per-job
// GET /employer/jobs/:id/applications calls with this one company-wide
// query (see EmployerRepository.findRecentApplicationsForCompany).
describe("EmployerService.getRecentApplications", () => {
  it("resolves the caller's membership and delegates to the repository with the company id, wrapping the result", async () => {
    const applications = [{ id: "app-1", jobId: "job-1" }];
    const { service, repo } = makeService({
      findRecentApplicationsForCompany: jest
        .fn()
        .mockResolvedValue(applications),
    });

    const result = await service.getRecentApplications("owner-1");

    expect(repo.findRecentApplicationsForCompany).toHaveBeenCalledWith(
      "owner-1-company",
    );
    expect(result).toEqual({ applications });
  });

  it("rejects a company role outside APPLICATION_REVIEW_ROLES (e.g. INTERVIEWER)", async () => {
    const { service } = makeService(
      {
        findRecentApplicationsForCompany: jest.fn(),
      },
      {},
      {
        resolveMembership: jest.fn().mockResolvedValue({
          employerId: "owner-1-company",
          role: "INTERVIEWER",
        }),
      },
    );

    await expect(
      service.getRecentApplications("interviewer-1"),
    ).rejects.toThrow();
  });

  it("rejects a caller with no company membership", async () => {
    const { service } = makeService(
      {
        findRecentApplicationsForCompany: jest.fn(),
      },
      {},
      {
        resolveMembership: jest.fn().mockResolvedValue(null),
      },
    );

    await expect(
      service.getRecentApplications("no-membership-user"),
    ).rejects.toThrow();
  });
});

describe("EmployerService.getHiringFunnel", () => {
  it("resolves the caller's membership and builds the funnel from the company's raw counts", async () => {
    const { service, repo } = makeService({
      getApplicationFunnelCounts: jest.fn().mockResolvedValue([
        { status: "PENDING", count: 10 },
        { status: "OFFER_ACCEPTED", count: 2 },
      ]),
    });

    const result = await service.getHiringFunnel("owner-1");

    expect(repo.getApplicationFunnelCounts).toHaveBeenCalledWith(
      "owner-1-company",
    );
    expect(result.stages[0]).toMatchObject({ status: "PENDING", count: 10 });
    expect(result.stages.at(-1)).toMatchObject({
      status: "OFFER_ACCEPTED",
      count: 2,
      conversionFromFirst: 20,
    });
  });

  it("rejects a company role outside APPLICATION_REVIEW_ROLES (e.g. INTERVIEWER)", async () => {
    const { service } = makeService(
      {
        getApplicationFunnelCounts: jest.fn(),
      },
      {},
      {
        resolveMembership: jest.fn().mockResolvedValue({
          employerId: "owner-1-company",
          role: "INTERVIEWER",
        }),
      },
    );

    await expect(service.getHiringFunnel("interviewer-1")).rejects.toThrow();
  });
});

describe("EmployerService.getDashboard", () => {
  it("aggregates profile, jobs, recent applications, and funnel in one call", async () => {
    const { service } = makeService({
      findProfileWithJobCount: jest
        .fn()
        .mockResolvedValue({ id: "profile-1", companyName: "Acme" }),
      countApplicationsForOwner: jest.fn().mockResolvedValue(4),
      findJobsByEmployer: jest.fn().mockResolvedValue([{ id: "job-1" }]),
      getEmployerJobStats: jest.fn().mockResolvedValue({
        totalApps: 4,
        shortlisted: 1,
        avgTimeToHireInDays: 3,
        avgFirstResponseHours: 5,
      }),
      findRecentApplicationsForCompany: jest
        .fn()
        .mockResolvedValue([{ id: "app-1" }]),
      getApplicationFunnelCounts: jest
        .fn()
        .mockResolvedValue([{ status: "PENDING", count: 4 }]),
    });

    const result = await service.getDashboard("owner-1");

    expect(result.profile).toMatchObject({
      id: "profile-1",
      totalApplications: 4,
    });
    expect(result.jobs).toEqual({
      jobs: [{ id: "job-1" }],
      stats: {
        totalApps: 4,
        shortlisted: 1,
        avgTimeToHireInDays: 3,
        avgFirstResponseHours: 5,
      },
    });
    expect(result.recentApplications).toEqual({
      applications: [{ id: "app-1" }],
    });
    expect(result.funnel?.stages[0]).toMatchObject({
      status: "PENDING",
      count: 4,
    });
  });

  it("returns every field as null (not a rejection) for a caller with no company membership", async () => {
    const { service } = makeService(
      {},
      {},
      { resolveMembership: jest.fn().mockResolvedValue(null) },
    );

    const result = await service.getDashboard("no-membership-user");

    expect(result).toEqual({
      profile: null,
      jobs: null,
      recentApplications: null,
      funnel: null,
    });
  });

  it("returns the profile but null for jobs/applications/funnel for a role outside APPLICATION_REVIEW_ROLES (e.g. INTERVIEWER, who can view but not review)", async () => {
    const { service } = makeService(
      {
        findProfileWithJobCount: jest
          .fn()
          .mockResolvedValue({ id: "profile-1", companyName: "Acme" }),
        countApplicationsForOwner: jest.fn().mockResolvedValue(0),
      },
      {},
      {
        resolveMembership: jest.fn().mockResolvedValue({
          employerId: "owner-1-company",
          role: "INTERVIEWER",
        }),
      },
    );

    const result = await service.getDashboard("interviewer-1");

    expect(result.profile).toMatchObject({ id: "profile-1" });
    expect(result.jobs).toBeNull();
    expect(result.recentApplications).toBeNull();
    expect(result.funnel).toBeNull();
  });

  it("still rejects a real failure (not a membership issue) instead of swallowing it to null", async () => {
    // Every other repo call this pulls in (listJobs/getRecentApplications/
    // getHiringFunnel all run unconditionally alongside getProfile) has to
    // stay mocked and resolving here too — leaving one unmocked would throw
    // its own synchronous TypeError while building that method's internal
    // Promise.all array, before Promise.all ever runs, orphaning the
    // already-rejected findProfileWithJobCount promise below with no
    // attached handler and crashing the test worker on an unhandled
    // rejection instead of failing this assertion cleanly.
    const { service } = makeService({
      findProfileWithJobCount: jest
        .fn()
        .mockRejectedValue(new Error("db down")),
      countApplicationsForOwner: jest.fn().mockResolvedValue(0),
      findJobsByEmployer: jest.fn().mockResolvedValue([]),
      getEmployerJobStats: jest.fn().mockResolvedValue({
        totalApps: 0,
        shortlisted: 0,
        avgTimeToHireInDays: 0,
        avgFirstResponseHours: 0,
      }),
      findRecentApplicationsForCompany: jest.fn().mockResolvedValue([]),
      getApplicationFunnelCounts: jest.fn().mockResolvedValue([]),
    });

    await expect(service.getDashboard("owner-1")).rejects.toThrow("db down");
  });
});

// Pure delegation to CommentsService, same shape as the scorecard/interview
// delegation tests above — CommentsService's own tests (comments.service.spec.ts)
// cover the actual behavior.
describe("EmployerService.listApplicationComments / addApplicationComment", () => {
  it("delegates listing to CommentsService", async () => {
    const { service, commentsService } = makeService();
    commentsService.list.mockResolvedValue({ comments: [] });

    const result = await service.listApplicationComments(application);

    expect(commentsService.list).toHaveBeenCalledWith(application.id);
    expect(result).toEqual({ comments: [] });
  });

  it("delegates creating to CommentsService with the author id", async () => {
    const { service, commentsService } = makeService();
    commentsService.create.mockResolvedValue({ id: "c1" });

    const result = await service.addApplicationComment(application, "user-1", {
      body: "Looks strong.",
    });

    expect(commentsService.create).toHaveBeenCalledWith(
      application.id,
      "user-1",
      { body: "Looks strong." },
    );
    expect(result).toEqual({ id: "c1" });
  });
});

describe("EmployerService.getApplicationInterviewIcs", () => {
  it("delegates to InterviewsService.getIcsFile", async () => {
    const { service, interviewsService } = makeService();
    interviewsService.getIcsFile.mockResolvedValue("BEGIN:VCALENDAR...");

    const result = await service.getApplicationInterviewIcs(application);

    expect(interviewsService.getIcsFile).toHaveBeenCalledWith(application);
    expect(result).toBe("BEGIN:VCALENDAR...");
  });
});

describe("EmployerService.exportJobApplicantsCsv", () => {
  it("fetches every applicant for the job (no status filter, no pagination) and serializes them to CSV", async () => {
    const talentRow = {
      status: "SHORTLISTED",
      appliedAt: new Date("2026-01-01T00:00:00.000Z"),
      resumeUrl: null,
      coverLetter: null,
      talent: {
        slug: "jane-doe",
        headline: "Engineer",
        level: "SENIOR",
        yearsExperience: 5,
        country: "Vietnam",
        user: { name: "Jane Doe" },
      },
    };
    const { service, repo } = makeService({
      findApplicationsForJob: jest
        .fn()
        .mockResolvedValue({ applications: [talentRow], total: 1 }),
    });

    const csv = await service.exportJobApplicantsCsv("job-1");

    expect(repo.findApplicationsForJob).toHaveBeenCalledWith(
      "job-1",
      { status: undefined },
      0,
      expect.any(Number),
    );
    expect(csv).toContain('"Jane Doe"');
    expect(csv).toContain("https://remotesea.io/talent/jane-doe");
  });

  it("passes an explicit status filter through to the same select listJobApplications uses, still unpaginated", async () => {
    const { service, repo } = makeService({
      findApplicationsForJob: jest
        .fn()
        .mockResolvedValue({ applications: [], total: 0 }),
    });

    await service.exportJobApplicantsCsv("job-1", "SHORTLISTED");

    expect(repo.findApplicationsForJob).toHaveBeenCalledWith(
      "job-1",
      { status: "SHORTLISTED" },
      0,
      expect.any(Number),
    );
  });

  it("produces a valid header-only CSV when the filter matches no applicants", async () => {
    const { service } = makeService({
      findApplicationsForJob: jest
        .fn()
        .mockResolvedValue({ applications: [], total: 0 }),
    });

    const csv = await service.exportJobApplicantsCsv("job-1", "REJECTED");

    expect(csv.slice(1).trim().split("\r\n")).toHaveLength(1);
  });
});

// PB32: OTP verification — 6 digits, 15 minutes, 5 wrong tries.
describe("EmployerService verification OTP (PB32)", () => {
  const EMPLOYER = "owner-1-company";
  const profile = {
    id: EMPLOYER,
    companyName: "Acme Inc",
    websiteUrl: "https://acme.com",
  };
  const pending = (code: string, overrides: Record<string, unknown> = {}) => ({
    id: "ver-1",
    employerId: EMPLOYER,
    token: hashVerificationCode(EMPLOYER, code),
    attempts: 0,
    consumedAt: null,
    expiresAt: new Date(Date.now() + 60_000),
    ...overrides,
  });

  it("emails a 6-digit code valid for 15 minutes and stores only its hash", async () => {
    const { service, repo, emailService } = makeService({
      findProfileForVerification: jest.fn().mockResolvedValue(profile),
      createEmailVerification: jest.fn().mockResolvedValue(undefined),
    });
    const before = Date.now();

    await service.submitVerification("owner-1", { email: "hr@acme.com" });

    const code = (emailService.sendEmployerVerificationEmail as jest.Mock).mock
      .calls[0][2] as string;
    expect(code).toMatch(/^\d{6}$/);
    const [, , storedToken, expiresAt] = (
      repo.createEmailVerification as jest.Mock
    ).mock.calls[0];
    expect(storedToken).toBe(hashVerificationCode(EMPLOYER, code));
    expect(storedToken).not.toContain(code);
    const ttl = (expiresAt as Date).getTime() - before;
    expect(ttl).toBeGreaterThan(14 * 60_000);
    expect(ttl).toBeLessThanOrEqual(15 * 60_000 + 1000);
  });

  it("verifies the company with the right code", async () => {
    const { service, repo } = makeService({
      findPendingEmailVerification: jest
        .fn()
        .mockResolvedValue(pending("123456")),
      consumeEmailVerification: jest.fn().mockResolvedValue(true),
    });

    await service.verifyCode("owner-1", { code: "123456" });

    expect(repo.consumeEmailVerification).toHaveBeenCalledWith(
      "ver-1",
      EMPLOYER,
    );
  });

  it("counts a wrong code and keeps the code usable below the limit", async () => {
    const { service, repo } = makeService({
      findPendingEmailVerification: jest
        .fn()
        .mockResolvedValue(pending("123456")),
      recordFailedVerificationAttempt: jest.fn().mockResolvedValue(1),
      burnEmailVerification: jest.fn(),
      consumeEmailVerification: jest.fn(),
    });

    await expect(
      service.verifyCode("owner-1", { code: "000000" }),
    ).rejects.toMatchObject({
      status: 400,
      response: { code: ErrorCode.INVALID_VERIFICATION_CODE },
    });
    expect(repo.burnEmailVerification).not.toHaveBeenCalled();
    expect(repo.consumeEmailVerification).not.toHaveBeenCalled();
  });

  it("burns the code on the 5th wrong entry", async () => {
    const { service, repo } = makeService({
      findPendingEmailVerification: jest
        .fn()
        .mockResolvedValue(pending("123456", { attempts: 4 })),
      recordFailedVerificationAttempt: jest.fn().mockResolvedValue(5),
      burnEmailVerification: jest.fn().mockResolvedValue(undefined),
    });

    await expect(
      service.verifyCode("owner-1", { code: "000000" }),
    ).rejects.toMatchObject({
      response: { code: ErrorCode.INVALID_OR_EXPIRED_TOKEN },
    });
    expect(repo.burnEmailVerification).toHaveBeenCalledWith("ver-1", EMPLOYER);
  });

  it("refuses an expired code even when it is correct", async () => {
    const { service, repo } = makeService({
      findPendingEmailVerification: jest
        .fn()
        .mockResolvedValue(
          pending("123456", { expiresAt: new Date(Date.now() - 1000) }),
        ),
      burnEmailVerification: jest.fn().mockResolvedValue(undefined),
      consumeEmailVerification: jest.fn(),
    });

    await expect(
      service.verifyCode("owner-1", { code: "123456" }),
    ).rejects.toMatchObject({
      response: { code: ErrorCode.INVALID_OR_EXPIRED_TOKEN },
    });
    expect(repo.consumeEmailVerification).not.toHaveBeenCalled();
  });

  it("refuses when no code is pending", async () => {
    const { service } = makeService({
      findPendingEmailVerification: jest.fn().mockResolvedValue(null),
    });
    await expect(
      service.verifyCode("owner-1", { code: "123456" }),
    ).rejects.toBeInstanceOf(BadRequestApiException);
  });

  it("is OWNER only", async () => {
    const { service } = makeService(
      { findPendingEmailVerification: jest.fn() },
      {},
      {
        resolveMembership: jest
          .fn()
          .mockResolvedValue({ employerId: EMPLOYER, role: "RECRUITER" }),
      },
    );
    await expect(
      service.verifyCode("rec-1", { code: "123456" }),
    ).rejects.toMatchObject({ status: 403 });
  });
});

// PB31: cover image must come from this account's own upload.
describe("EmployerService.updateProfile cover image (PB31)", () => {
  const repo = () => ({
    findProfileByCompanyId: jest.fn().mockResolvedValue({
      id: "owner-1-company",
      logoUrl: null,
      coverImageUrl: null,
    }),
    updateProfile: jest.fn().mockResolvedValue({ id: "owner-1-company" }),
  });

  it("rejects a cover image URL that isn't this user's upload", async () => {
    const r = repo();
    const { service } = makeService(r);
    await expect(
      service.updateProfile("owner-1", {
        coverImageUrl: "https://evil.example/cover.png",
      }),
    ).rejects.toMatchObject({
      response: { code: ErrorCode.UPLOAD_URL_NOT_OWNED },
    });
    expect(r.updateProfile).not.toHaveBeenCalled();
  });

  it("saves settings fields with an owned cover image", async () => {
    const r = repo();
    const { service } = makeService(r);
    const dto = {
      coverImageUrl: "https://remotesea.io/uploads/cover/owner-1/c.png",
      benefits: ["Remote stipend"],
      linkedinUrl: "https://www.linkedin.com/company/acme",
      hqAddress: "1 Raffles Place, Singapore",
    };
    await service.updateProfile("owner-1", dto);
    expect(r.updateProfile).toHaveBeenCalledWith("owner-1-company", dto);
  });

  it("is OWNER only", async () => {
    const { service } = makeService(
      repo(),
      {},
      {
        resolveMembership: jest.fn().mockResolvedValue({
          employerId: "owner-1-company",
          role: "RECRUITER",
        }),
      },
    );
    await expect(
      service.updateProfile("rec-1", { hqAddress: "x" }),
    ).rejects.toMatchObject({ status: 403 });
  });
});

describe("EmployerService.confirmVerification legacy route vs OTP rows (PB32)", () => {
  it("never confirms an OTP row, even given its stored token", async () => {
    const findEmailVerificationByToken = jest.fn();
    const { service } = makeService({ findEmailVerificationByToken });
    await expect(
      service.confirmVerification({
        token: hashVerificationCode("owner-1-company", "123456"),
      }),
    ).rejects.toBeInstanceOf(BadRequestApiException);
    expect(findEmailVerificationByToken).not.toHaveBeenCalled();
  });
});
