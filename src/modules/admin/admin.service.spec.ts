import { AdminService } from "./admin.service";
import type { AdminRepository } from "./admin.repository";
import { BadRequestApiException } from "@/common/exceptions/api.exception";
import { ErrorCode } from "@/common/exceptions/error-codes";

const pendingJob = {
  id: "job-1",
  title: "Engineer",
  slug: "engineer",
  status: "PENDING_REVIEW",
  employer: { user: { email: "employer@example.com" } },
};

const makeService = (repoOverrides: Partial<AdminRepository> = {}) => {
  const adminRepository = { ...repoOverrides } as unknown as AdminRepository;
  const emailService = {
    sendJobLiveEmail: jest.fn().mockResolvedValue(undefined),
    sendJobRejectedEmail: jest.fn().mockResolvedValue(undefined),
  };
  return {
    service: new AdminService(adminRepository, emailService as never),
    adminRepository,
    emailService,
  };
};

// approveJob/rejectJob re-check PENDING_REVIEW atomically at write time
// (admin.repository.ts) instead of trusting reviewJob()'s upfront read —
// these cover the race that upfront-only check couldn't close.
describe("AdminService.reviewJob", () => {
  it("throws JOB_NOT_PENDING_REVIEW when approveJob's atomic re-check finds the job already moved on", async () => {
    const { service } = makeService({
      findJobWithEmployerEmail: jest.fn().mockResolvedValue(pendingJob),
      approveJob: jest.fn().mockResolvedValue(null),
    });

    const error = await service
      .reviewJob("job-1", { action: "approve" })
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(BadRequestApiException);
    expect((error as BadRequestApiException).getResponse()).toMatchObject({
      code: ErrorCode.JOB_NOT_PENDING_REVIEW,
    });
  });

  it("throws JOB_NOT_PENDING_REVIEW when rejectJob's atomic re-check finds the job already moved on", async () => {
    const { service } = makeService({
      findJobWithEmployerEmail: jest.fn().mockResolvedValue(pendingJob),
      rejectJob: jest.fn().mockResolvedValue(null),
    });

    const error = await service
      .reviewJob("job-1", { action: "reject" })
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(BadRequestApiException);
    expect((error as BadRequestApiException).getResponse()).toMatchObject({
      code: ErrorCode.JOB_NOT_PENDING_REVIEW,
    });
  });

  it("approves and emails when the atomic re-check succeeds", async () => {
    const { service, emailService } = makeService({
      findJobWithEmployerEmail: jest.fn().mockResolvedValue(pendingJob),
      approveJob: jest
        .fn()
        .mockResolvedValue({ status: "ACTIVE", publishedAt: new Date() }),
    });

    const result = await service.reviewJob("job-1", { action: "approve" });

    expect(result.status).toBe("ACTIVE");
    expect(emailService.sendJobLiveEmail).toHaveBeenCalled();
  });
});
