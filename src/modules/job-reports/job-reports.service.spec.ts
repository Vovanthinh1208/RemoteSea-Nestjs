import { JobReportsService } from "./job-reports.service";
import type { JobReportsRepository } from "./job-reports.repository";
import {
  BadRequestApiException,
  ConflictApiException,
  NotFoundApiException,
} from "@/common/exceptions/api.exception";
import { ErrorCode } from "@/common/exceptions/error-codes";
import type { AuthenticatedUser } from "@/common/interfaces/authenticated-user.interface";

const makeService = (repoOverrides: Partial<JobReportsRepository> = {}) => {
  const repo = { ...repoOverrides } as unknown as JobReportsRepository;
  const notificationsService = {
    create: jest.fn().mockResolvedValue(undefined),
  };
  const auditLogService = { record: jest.fn().mockResolvedValue(undefined) };
  return {
    service: new JobReportsService(
      repo,
      notificationsService as never,
      auditLogService as never,
    ),
    repo,
    notificationsService,
    auditLogService,
  };
};

const talentUser: AuthenticatedUser = {
  id: "talent-user-1",
  role: "TALENT",
} as AuthenticatedUser;

const admin: AuthenticatedUser = {
  id: "admin-1",
  email: "admin@remotesea.io",
  name: "Admin One",
  role: "ADMIN",
};

describe("JobReportsService.create", () => {
  it("throws JOB_NOT_FOUND when the job doesn't exist", async () => {
    const { service } = makeService({
      findJobForReport: jest.fn().mockResolvedValue(null),
    });

    const error = await service
      .create(talentUser, "job-1", { reason: "SCAM" })
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(NotFoundApiException);
    expect((error as NotFoundApiException).getResponse()).toMatchObject({
      code: ErrorCode.JOB_NOT_FOUND,
    });
  });

  it("throws JOB_ALREADY_REPORTED when the caller already has an OPEN report on this job", async () => {
    const { service } = makeService({
      findJobForReport: jest.fn().mockResolvedValue({ id: "job-1" }),
      findOpenByJobAndReporter: jest.fn().mockResolvedValue({ id: "rep-1" }),
    });

    const error = await service
      .create(talentUser, "job-1", { reason: "SCAM" })
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ConflictApiException);
    expect((error as ConflictApiException).getResponse()).toMatchObject({
      code: ErrorCode.JOB_ALREADY_REPORTED,
    });
  });

  it("creates a report when the job exists and the caller has no OPEN report on it", async () => {
    const create = jest.fn().mockResolvedValue({ id: "rep-1", status: "OPEN" });
    const { service } = makeService({
      findJobForReport: jest.fn().mockResolvedValue({ id: "job-1" }),
      findOpenByJobAndReporter: jest.fn().mockResolvedValue(null),
      create,
    });

    const result = await service.create(talentUser, "job-1", {
      reason: "SCAM",
      details: "Asked for money upfront.",
    });

    expect(create).toHaveBeenCalledWith({
      jobId: "job-1",
      reporterId: talentUser.id,
      reason: "SCAM",
      details: "Asked for money upfront.",
    });
    expect(result).toEqual({ id: "rep-1", status: "OPEN" });
  });

  it("allows reporting again once the caller's prior report on the job is no longer OPEN", async () => {
    const create = jest.fn().mockResolvedValue({ id: "rep-2", status: "OPEN" });
    const { service } = makeService({
      findJobForReport: jest.fn().mockResolvedValue({ id: "job-1" }),
      // findOpenByJobAndReporter only ever returns OPEN reports — a prior
      // RESOLVED/DISMISSED one is invisible to this check by construction.
      findOpenByJobAndReporter: jest.fn().mockResolvedValue(null),
      create,
    });

    await service.create(talentUser, "job-1", { reason: "SCAM" });
    expect(create).toHaveBeenCalled();
  });
});

describe("JobReportsService.resolve", () => {
  it("throws JOB_REPORT_NOT_FOUND when the report doesn't exist", async () => {
    const { service } = makeService({
      findByIdForAdmin: jest.fn().mockResolvedValue(null),
    });

    const error = await service
      .resolve("rep-1", { action: "resolve" }, admin)
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(NotFoundApiException);
    expect((error as NotFoundApiException).getResponse()).toMatchObject({
      code: ErrorCode.JOB_REPORT_NOT_FOUND,
    });
  });

  it("throws JOB_REPORT_ALREADY_RESOLVED when the upfront read shows a non-OPEN status", async () => {
    const { service } = makeService({
      findByIdForAdmin: jest
        .fn()
        .mockResolvedValue({ id: "rep-1", status: "DISMISSED" }),
    });

    const error = await service
      .resolve("rep-1", { action: "resolve" }, admin)
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(BadRequestApiException);
    expect((error as BadRequestApiException).getResponse()).toMatchObject({
      code: ErrorCode.JOB_REPORT_ALREADY_RESOLVED,
    });
  });

  // Same race-safety shape as AdminService.reviewJob's atomic re-check test —
  // the upfront read passes but the atomic updateMany finds it already moved
  // on (a concurrent admin action landed in between).
  it("throws JOB_REPORT_ALREADY_RESOLVED when the atomic update finds it no longer OPEN", async () => {
    const { service } = makeService({
      findByIdForAdmin: jest
        .fn()
        .mockResolvedValue({ id: "rep-1", status: "OPEN" }),
      updateStatus: jest.fn().mockResolvedValue(null),
    });

    const error = await service
      .resolve("rep-1", { action: "resolve" }, admin)
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(BadRequestApiException);
    expect((error as BadRequestApiException).getResponse()).toMatchObject({
      code: ErrorCode.JOB_REPORT_ALREADY_RESOLVED,
    });
  });

  it("resolves an OPEN report and notifies the reporter", async () => {
    const updateStatus = jest.fn().mockResolvedValue({
      id: "rep-1",
      status: "RESOLVED",
      resolvedAt: new Date(),
    });
    const { service, notificationsService, auditLogService } = makeService({
      findByIdForAdmin: jest.fn().mockResolvedValue({
        id: "rep-1",
        status: "OPEN",
        reporterId: "reporter-1",
        job: { title: "Backend Engineer", slug: "backend-engineer-a1b2c3" },
      }),
      updateStatus,
    });

    const result = await service.resolve("rep-1", { action: "resolve" }, admin);

    expect(updateStatus).toHaveBeenCalledWith("rep-1", "RESOLVED");
    expect(result.status).toBe("RESOLVED");
    expect(notificationsService.create).toHaveBeenCalledWith({
      userId: "reporter-1",
      type: "JOB_REPORT_RESOLVED",
      title: "Your report was resolved",
      body: 'Your report on "Backend Engineer" has been resolved.',
      link: "/jobs/backend-engineer-a1b2c3",
    });
    expect(auditLogService.record).toHaveBeenCalledWith({
      adminId: "admin-1",
      adminEmail: "admin@remotesea.io",
      action: "JOB_REPORT_RESOLVED",
      targetType: "JOB_REPORT",
      targetId: "rep-1",
      targetLabel: "Backend Engineer",
      before: { status: "OPEN" },
      after: { status: "RESOLVED" },
    });
  });

  it("dismisses an OPEN report and notifies the reporter", async () => {
    const updateStatus = jest.fn().mockResolvedValue({
      id: "rep-1",
      status: "DISMISSED",
      resolvedAt: new Date(),
    });
    const { service, notificationsService, auditLogService } = makeService({
      findByIdForAdmin: jest.fn().mockResolvedValue({
        id: "rep-1",
        status: "OPEN",
        reporterId: "reporter-1",
        job: { title: "Backend Engineer", slug: "backend-engineer-a1b2c3" },
      }),
      updateStatus,
    });

    const result = await service.resolve("rep-1", { action: "dismiss" }, admin);

    expect(updateStatus).toHaveBeenCalledWith("rep-1", "DISMISSED");
    expect(result.status).toBe("DISMISSED");
    expect(notificationsService.create).toHaveBeenCalledWith({
      userId: "reporter-1",
      type: "JOB_REPORT_RESOLVED",
      title: "Your report was dismissed",
      body: 'Your report on "Backend Engineer" has been dismissed.',
      link: "/jobs/backend-engineer-a1b2c3",
    });
    expect(auditLogService.record).toHaveBeenCalledWith({
      adminId: "admin-1",
      adminEmail: "admin@remotesea.io",
      action: "JOB_REPORT_DISMISSED",
      targetType: "JOB_REPORT",
      targetId: "rep-1",
      targetLabel: "Backend Engineer",
      before: { status: "OPEN" },
      after: { status: "DISMISSED" },
    });
  });
});
