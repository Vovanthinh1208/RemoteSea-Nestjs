import type { ExecutionContext } from "@nestjs/common";
import { JobPayerOwnershipGuard } from "./job-payer-ownership.guard";
import { NotFoundApiException } from "@/common/exceptions/api.exception";
import type { BillingRepository } from "../billing.repository";
import type { PrismaService } from "@/core/database/prisma.service";

const makeContext = (
  user: { id: string; role: string },
  body: Record<string, unknown>,
): ExecutionContext =>
  ({
    switchToHttp: () => ({ getRequest: () => ({ user, params: {}, body }) }),
  }) as unknown as ExecutionContext;

const makeGuard = (
  job: unknown,
  membership: { employerId: string; role: string } | null,
) => {
  const findJobWithEmployer = jest.fn().mockResolvedValue(job);
  const findUnique = jest.fn().mockResolvedValue(membership);
  const prisma = {
    companyMember: { findUnique },
  } as unknown as PrismaService;
  return new JobPayerOwnershipGuard(prisma, {
    findJobWithEmployer,
  } as unknown as BillingRepository);
};

describe("JobPayerOwnershipGuard", () => {
  const job = { id: "job-1", employerId: "company-1" };

  it("reads the job id from the request body, not route params", async () => {
    const findJobWithEmployer = jest.fn().mockResolvedValue(job);
    const prisma = {
      companyMember: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ employerId: "company-1", role: "OWNER" }),
      },
    } as unknown as PrismaService;
    const guard = new JobPayerOwnershipGuard(prisma, {
      findJobWithEmployer,
    } as unknown as BillingRepository);

    const context = makeContext(
      { id: "owner-1", role: "EMPLOYER" },
      { jobId: "job-1" },
    );
    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(findJobWithEmployer).toHaveBeenCalledWith("job-1");
  });

  it("throws NotFound (not Forbidden) for a non-member, to avoid leaking job existence", async () => {
    const guard = makeGuard(job, null);

    const context = makeContext(
      { id: "someone-else", role: "EMPLOYER" },
      { jobId: "job-1" },
    );
    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      NotFoundApiException,
    );
  });

  it("throws NotFound for a same-company RECRUITER — checkout is OWNER only", async () => {
    const guard = makeGuard(job, {
      employerId: "company-1",
      role: "RECRUITER",
    });

    const context = makeContext(
      { id: "recruiter-1", role: "EMPLOYER" },
      { jobId: "job-1" },
    );
    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      NotFoundApiException,
    );
  });
});
