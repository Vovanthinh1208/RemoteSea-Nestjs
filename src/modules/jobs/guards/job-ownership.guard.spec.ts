import type { ExecutionContext } from "@nestjs/common";
import { JobOwnershipGuard } from "./job-ownership.guard";
import { ForbiddenApiException } from "@/common/exceptions/api.exception";
import type { JobsRepository } from "../jobs.repository";

const makeContext = (
  user: { id: string; role: string },
  params: Record<string, string> = { id: "job-1" },
): ExecutionContext =>
  ({
    switchToHttp: () => ({ getRequest: () => ({ user, params }) }),
  }) as unknown as ExecutionContext;

describe("JobOwnershipGuard", () => {
  const job = { id: "job-1", employer: { userId: "owner-1" } };

  it("loads the job via jobsRepository.findById and compares employer.userId", async () => {
    const findById = jest.fn().mockResolvedValue(job);
    const guard = new JobOwnershipGuard({
      findById,
    } as unknown as JobsRepository);

    const context = makeContext({ id: "owner-1", role: "EMPLOYER" });
    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(findById).toHaveBeenCalledWith("job-1");
  });

  it("allows ADMIN even when not the owner", async () => {
    const findById = jest.fn().mockResolvedValue(job);
    const guard = new JobOwnershipGuard({
      findById,
    } as unknown as JobsRepository);

    const context = makeContext({ id: "someone-else", role: "ADMIN" });
    await expect(guard.canActivate(context)).resolves.toBe(true);
  });

  it("forbids a non-owner, non-admin user", async () => {
    const findById = jest.fn().mockResolvedValue(job);
    const guard = new JobOwnershipGuard({
      findById,
    } as unknown as JobsRepository);

    const context = makeContext({ id: "someone-else", role: "EMPLOYER" });
    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      ForbiddenApiException,
    );
  });
});
