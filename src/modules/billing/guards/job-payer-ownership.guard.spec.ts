import type { ExecutionContext } from "@nestjs/common";
import { JobPayerOwnershipGuard } from "./job-payer-ownership.guard";
import { NotFoundApiException } from "@/common/exceptions/api.exception";
import type { BillingRepository } from "../billing.repository";

const makeContext = (
  user: { id: string; role: string },
  body: Record<string, unknown>,
): ExecutionContext =>
  ({
    switchToHttp: () => ({ getRequest: () => ({ user, params: {}, body }) }),
  }) as unknown as ExecutionContext;

describe("JobPayerOwnershipGuard", () => {
  const job = { id: "job-1", employer: { userId: "owner-1" } };

  it("reads the job id from the request body, not route params", async () => {
    const findJobWithEmployer = jest.fn().mockResolvedValue(job);
    const guard = new JobPayerOwnershipGuard({
      findJobWithEmployer,
    } as unknown as BillingRepository);

    const context = makeContext({ id: "owner-1", role: "EMPLOYER" }, {
      jobId: "job-1",
    });
    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(findJobWithEmployer).toHaveBeenCalledWith("job-1");
  });

  it("throws NotFound (not Forbidden) for a non-owner, to avoid leaking job existence", async () => {
    const findJobWithEmployer = jest.fn().mockResolvedValue(job);
    const guard = new JobPayerOwnershipGuard({
      findJobWithEmployer,
    } as unknown as BillingRepository);

    const context = makeContext({ id: "someone-else", role: "EMPLOYER" }, {
      jobId: "job-1",
    });
    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      NotFoundApiException,
    );
  });
});
