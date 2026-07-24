import { Logger } from "@nestjs/common";
import { AdminService } from "./admin.service";
import type { AdminRepository } from "./admin.repository";
import type { EmployerService } from "@/modules/employer/employer.service";
import type { JobsService } from "@/modules/jobs/jobs.service";
import { BadRequestApiException } from "@/common/exceptions/api.exception";
import { ErrorCode } from "@/common/exceptions/error-codes";

const pendingJob = {
  id: "job-1",
  title: "Engineer",
  slug: "engineer",
  status: "PENDING_REVIEW",
  employer: { user: { email: "employer@example.com" } },
};

const makeService = (
  overrides: {
    adminRepository?: Partial<AdminRepository>;
    jobsService?: Partial<JobsService>;
    employerService?: Partial<EmployerService>;
  } = {},
) => {
  const adminRepository = {
    ...overrides.adminRepository,
  } as unknown as AdminRepository;
  const jobsService = { ...overrides.jobsService } as unknown as JobsService;
  const employerService = {
    ...overrides.employerService,
  } as unknown as EmployerService;
  const emailService = {
    sendJobLiveEmail: jest.fn().mockResolvedValue(undefined),
    sendJobRejectedEmail: jest.fn().mockResolvedValue(undefined),
  };
  return {
    service: new AdminService(
      adminRepository,
      employerService,
      jobsService,
      emailService as never,
    ),
    adminRepository,
    jobsService,
    employerService,
    emailService,
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
      .reviewJob("job-1", { action: "approve" }, "admin-1")
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
      .reviewJob("job-1", { action: "reject" }, "admin-1")
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
      "admin-1",
    );

    expect(result.status).toBe("ACTIVE");
    expect(emailService.sendJobLiveEmail).toHaveBeenCalled();
  });

  // There's no audit table for admin actions — this log line is the only
  // record of who approved/rejected a job, so it's worth pinning in a test.
  it("logs the acting admin's id on approval, for an audit trail no table exists for", async () => {
    const logSpy = jest.spyOn(Logger.prototype, "log").mockImplementation();
    const { service } = makeService({
      adminRepository: {
        findJobWithEmployerEmail: jest.fn().mockResolvedValue(pendingJob),
      },
      jobsService: {
        approveForReview: jest
          .fn()
          .mockResolvedValue({ status: "ACTIVE", publishedAt: new Date() }),
      },
    });

    await service.reviewJob("job-1", { action: "approve" }, "admin-42");

    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("admin-42"));
    logSpy.mockRestore();
  });
});

describe("AdminService.updateEmployer", () => {
  it("delegates verify to EmployerService.setVerified", async () => {
    const { service, employerService } = makeService({
      adminRepository: {
        findEmployerById: jest.fn().mockResolvedValue({ id: "emp-1" }),
      },
      employerService: { setVerified: jest.fn().mockResolvedValue(undefined) },
    });

    await service.updateEmployer("emp-1", { action: "verify" }, "admin-1");

    expect(employerService.setVerified).toHaveBeenCalledWith("emp-1", true);
  });

  it("delegates suspend to EmployerService.suspend", async () => {
    const { service, employerService } = makeService({
      adminRepository: {
        findEmployerById: jest.fn().mockResolvedValue({ id: "emp-1" }),
      },
      employerService: { suspend: jest.fn().mockResolvedValue(undefined) },
    });

    await service.updateEmployer("emp-1", { action: "suspend" }, "admin-1");

    expect(employerService.suspend).toHaveBeenCalledWith("emp-1");
  });
});
