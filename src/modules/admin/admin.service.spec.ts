import { AdminService } from "./admin.service";
import type { AdminRepository } from "./admin.repository";
import type { EmployerService } from "@/modules/employer/employer.service";
import type { JobsService } from "@/modules/jobs/jobs.service";
import type { AuthService } from "@/modules/auth/auth.service";
import type { AuditLogService } from "@/common/services/audit-log.service";
import {
  BadRequestApiException,
  NotFoundApiException,
} from "@/common/exceptions/api.exception";
import { ErrorCode } from "@/common/exceptions/error-codes";
import type { AuthenticatedUser } from "@/common/interfaces/authenticated-user.interface";

const pendingJob = {
  id: "job-1",
  title: "Engineer",
  slug: "engineer",
  status: "PENDING_REVIEW",
  employer: { user: { email: "employer@example.com" } },
};

const admin: AuthenticatedUser = {
  id: "admin-1",
  email: "admin@remotesea.io",
  name: "Admin One",
  role: "ADMIN",
};

const makeService = (
  overrides: {
    adminRepository?: Partial<AdminRepository>;
    jobsService?: Partial<JobsService>;
    employerService?: Partial<EmployerService>;
    authService?: Partial<AuthService>;
  } = {},
) => {
  const adminRepository = {
    ...overrides.adminRepository,
  } as unknown as AdminRepository;
  const jobsService = { ...overrides.jobsService } as unknown as JobsService;
  const employerService = {
    ...overrides.employerService,
  } as unknown as EmployerService;
  const authService = {
    revokeAllSessionsForUser: jest.fn().mockResolvedValue(0),
    ...overrides.authService,
  } as unknown as AuthService;
  const emailService = {
    sendJobLiveEmail: jest.fn().mockResolvedValue(undefined),
    sendJobRejectedEmail: jest.fn().mockResolvedValue(undefined),
  };
  const auditLogService = { record: jest.fn().mockResolvedValue(undefined) };
  return {
    service: new AdminService(
      adminRepository,
      employerService,
      jobsService,
      {} as never,
      authService,
      emailService as never,
      auditLogService as unknown as AuditLogService,
    ),
    adminRepository,
    jobsService,
    employerService,
    authService,
    emailService,
    auditLogService,
  };
};

// approveForReview/rejectForReview (JobsService, delegating to
// JobsRepository) re-check PENDING_REVIEW atomically at write time instead
// of trusting reviewJob()'s upfront read — these cover the race that
// upfront-only check couldn't close.
describe("AdminService.reviewJob", () => {
  it("throws JOB_NOT_PENDING_REVIEW when approveForReview's atomic re-check finds the job already moved on", async () => {
    const { service } = makeService({
      adminRepository: {
        findJobWithEmployerEmail: jest.fn().mockResolvedValue(pendingJob),
      },
      jobsService: { approveForReview: jest.fn().mockResolvedValue(null) },
    });

    const error = await service
      .reviewJob("job-1", { action: "approve" }, admin)
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(BadRequestApiException);
    expect((error as BadRequestApiException).getResponse()).toMatchObject({
      code: ErrorCode.JOB_NOT_PENDING_REVIEW,
    });
  });

  it("throws JOB_NOT_PENDING_REVIEW when rejectForReview's atomic re-check finds the job already moved on", async () => {
    const { service } = makeService({
      adminRepository: {
        findJobWithEmployerEmail: jest.fn().mockResolvedValue(pendingJob),
      },
      jobsService: { rejectForReview: jest.fn().mockResolvedValue(null) },
    });

    const error = await service
      .reviewJob("job-1", { action: "reject" }, admin)
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(BadRequestApiException);
    expect((error as BadRequestApiException).getResponse()).toMatchObject({
      code: ErrorCode.JOB_NOT_PENDING_REVIEW,
    });
  });

  it("approves and emails when the atomic re-check succeeds", async () => {
    const { service, emailService } = makeService({
      adminRepository: {
        findJobWithEmployerEmail: jest.fn().mockResolvedValue(pendingJob),
      },
      jobsService: {
        approveForReview: jest
          .fn()
          .mockResolvedValue({ status: "ACTIVE", publishedAt: new Date() }),
      },
    });

    const result = await service.reviewJob(
      "job-1",
      { action: "approve" },
      admin,
    );

    expect(result.status).toBe("ACTIVE");
    expect(emailService.sendJobLiveEmail).toHaveBeenCalled();
  });

  it("records a JOB_APPROVED audit entry with the before/after status", async () => {
    const { service, auditLogService } = makeService({
      adminRepository: {
        findJobWithEmployerEmail: jest.fn().mockResolvedValue(pendingJob),
      },
      jobsService: {
        approveForReview: jest
          .fn()
          .mockResolvedValue({ status: "ACTIVE", publishedAt: new Date() }),
      },
    });

    await service.reviewJob("job-1", { action: "approve" }, admin);

    expect(auditLogService.record).toHaveBeenCalledWith({
      adminId: "admin-1",
      adminEmail: "admin@remotesea.io",
      action: "JOB_APPROVED",
      targetType: "JOB",
      targetId: "job-1",
      targetLabel: "Engineer",
      before: { status: "PENDING_REVIEW" },
      after: { status: "ACTIVE" },
    });
  });

  it("records a JOB_REJECTED audit entry including the rejection note", async () => {
    const { service, auditLogService } = makeService({
      adminRepository: {
        findJobWithEmployerEmail: jest.fn().mockResolvedValue(pendingJob),
      },
      jobsService: {
        rejectForReview: jest.fn().mockResolvedValue({ status: "REJECTED" }),
      },
    });

    await service.reviewJob(
      "job-1",
      { action: "reject", note: "Missing salary range" },
      admin,
    );

    expect(auditLogService.record).toHaveBeenCalledWith({
      adminId: "admin-1",
      adminEmail: "admin@remotesea.io",
      action: "JOB_REJECTED",
      targetType: "JOB",
      targetId: "job-1",
      targetLabel: "Engineer",
      before: { status: "PENDING_REVIEW" },
      after: { status: "REJECTED", note: "Missing salary range" },
    });
  });
});

describe("AdminService.updateEmployer", () => {
  it("delegates verify to EmployerService.setVerified", async () => {
    const { service, employerService } = makeService({
      adminRepository: {
        findEmployerById: jest.fn().mockResolvedValue({
          id: "emp-1",
          companyName: "Acme Inc",
          isVerified: false,
        }),
      },
      employerService: { setVerified: jest.fn().mockResolvedValue(undefined) },
    });

    await service.updateEmployer("emp-1", { action: "verify" }, admin);

    expect(employerService.setVerified).toHaveBeenCalledWith("emp-1", true);
  });

  it("delegates suspend to EmployerService.suspend", async () => {
    const { service, employerService } = makeService({
      adminRepository: {
        findEmployerById: jest.fn().mockResolvedValue({
          id: "emp-1",
          companyName: "Acme Inc",
          isVerified: true,
        }),
      },
      employerService: { suspend: jest.fn().mockResolvedValue(undefined) },
    });

    await service.updateEmployer("emp-1", { action: "suspend" }, admin);

    expect(employerService.suspend).toHaveBeenCalledWith("emp-1");
  });

  it("records an EMPLOYER_VERIFIED audit entry with the before/after isVerified flag", async () => {
    const { service, auditLogService } = makeService({
      adminRepository: {
        findEmployerById: jest.fn().mockResolvedValue({
          id: "emp-1",
          companyName: "Acme Inc",
          isVerified: false,
        }),
      },
      employerService: { setVerified: jest.fn().mockResolvedValue(undefined) },
    });

    await service.updateEmployer("emp-1", { action: "verify" }, admin);

    expect(auditLogService.record).toHaveBeenCalledWith({
      adminId: "admin-1",
      adminEmail: "admin@remotesea.io",
      action: "EMPLOYER_VERIFIED",
      targetType: "EMPLOYER",
      targetId: "emp-1",
      targetLabel: "Acme Inc",
      before: { isVerified: false },
      after: { isVerified: true },
    });
  });

  it("records an EMPLOYER_SUSPENDED audit entry with the before/after isVerified flag", async () => {
    const { service, auditLogService } = makeService({
      adminRepository: {
        findEmployerById: jest.fn().mockResolvedValue({
          id: "emp-1",
          companyName: "Acme Inc",
          isVerified: true,
        }),
      },
      employerService: { suspend: jest.fn().mockResolvedValue(undefined) },
    });

    await service.updateEmployer("emp-1", { action: "suspend" }, admin);

    expect(auditLogService.record).toHaveBeenCalledWith({
      adminId: "admin-1",
      adminEmail: "admin@remotesea.io",
      action: "EMPLOYER_SUSPENDED",
      targetType: "EMPLOYER",
      targetId: "emp-1",
      targetLabel: "Acme Inc",
      before: { isVerified: true },
      after: { isVerified: false },
    });
  });
});

// Security fix for "JWT role never re-validated": rather than re-checking
// role/bannedAt from the DB on every request, ban/role-change here revokes
// every existing session for the target user, so JwtStrategy's own
// per-request revocation check is what closes the stale-privilege window.
describe("AdminService.updateUser", () => {
  const targetUser = {
    id: "user-1",
    email: "talent@example.com",
    role: "TALENT",
    bannedAt: null,
  };

  it("throws USER_NOT_FOUND for a nonexistent user", async () => {
    const { service } = makeService({
      adminRepository: { findUserById: jest.fn().mockResolvedValue(null) },
    });

    const error = await service
      .updateUser("missing", { action: "ban" }, admin)
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(NotFoundApiException);
    expect((error as NotFoundApiException).getResponse()).toMatchObject({
      code: ErrorCode.USER_NOT_FOUND,
    });
  });

  it("refuses to let an admin ban or change the role of their own account", async () => {
    const { service, adminRepository, authService } = makeService({
      adminRepository: {
        findUserById: jest
          .fn()
          .mockResolvedValue({ ...targetUser, id: "admin-1" }),
        updateUserRoleOrBan: jest.fn(),
      },
    });

    const error = await service
      .updateUser("admin-1", { action: "ban" }, admin)
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(BadRequestApiException);
    expect((error as BadRequestApiException).getResponse()).toMatchObject({
      code: ErrorCode.CANNOT_MODIFY_OWN_ACCOUNT,
    });
    expect(adminRepository.updateUserRoleOrBan).not.toHaveBeenCalled();
    expect(authService.revokeAllSessionsForUser).not.toHaveBeenCalled();
  });

  it("bans the user and revokes every one of their sessions", async () => {
    const { service, adminRepository, authService } = makeService({
      adminRepository: {
        findUserById: jest.fn().mockResolvedValue(targetUser),
        updateUserRoleOrBan: jest.fn().mockResolvedValue(undefined),
      },
    });

    await service.updateUser("user-1", { action: "ban" }, admin);

    expect(adminRepository.updateUserRoleOrBan).toHaveBeenCalledWith("user-1", {
      bannedAt: expect.any(Date),
    });
    expect(authService.revokeAllSessionsForUser).toHaveBeenCalledWith("user-1");
  });

  it("unbans the user WITHOUT revoking sessions — there's no stale privilege to close", async () => {
    const { service, adminRepository, authService } = makeService({
      adminRepository: {
        findUserById: jest
          .fn()
          .mockResolvedValue({ ...targetUser, bannedAt: new Date() }),
        updateUserRoleOrBan: jest.fn().mockResolvedValue(undefined),
      },
    });

    await service.updateUser("user-1", { action: "unban" }, admin);

    expect(adminRepository.updateUserRoleOrBan).toHaveBeenCalledWith("user-1", {
      bannedAt: null,
    });
    expect(authService.revokeAllSessionsForUser).not.toHaveBeenCalled();
  });

  it("changes the role and revokes every one of their sessions", async () => {
    const { service, adminRepository, authService } = makeService({
      adminRepository: {
        findUserById: jest.fn().mockResolvedValue(targetUser),
        updateUserRoleOrBan: jest.fn().mockResolvedValue(undefined),
      },
    });

    await service.updateUser(
      "user-1",
      { action: "change-role", role: "ADMIN" },
      admin,
    );

    expect(adminRepository.updateUserRoleOrBan).toHaveBeenCalledWith("user-1", {
      role: "ADMIN",
    });
    expect(authService.revokeAllSessionsForUser).toHaveBeenCalledWith("user-1");
  });

  it("records a USER_BANNED audit entry with the before/after bannedAt", async () => {
    const { service, auditLogService } = makeService({
      adminRepository: {
        findUserById: jest.fn().mockResolvedValue(targetUser),
        updateUserRoleOrBan: jest.fn().mockResolvedValue(undefined),
      },
    });

    await service.updateUser("user-1", { action: "ban" }, admin);

    expect(auditLogService.record).toHaveBeenCalledWith(
      expect.objectContaining({
        adminId: "admin-1",
        adminEmail: "admin@remotesea.io",
        action: "USER_BANNED",
        targetType: "USER",
        targetId: "user-1",
        targetLabel: "talent@example.com",
        before: { role: "TALENT", bannedAt: null },
        after: { bannedAt: expect.any(Date) },
      }),
    );
  });
});
