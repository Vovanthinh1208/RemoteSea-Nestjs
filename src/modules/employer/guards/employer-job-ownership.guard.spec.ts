import type { ExecutionContext } from "@nestjs/common";
import { EmployerJobOwnershipGuard } from "./employer-job-ownership.guard";
import { ForbiddenApiException } from "@/common/exceptions/api.exception";
import type { EmployerRepository } from "../employer.repository";

const makeContext = (
  user: { id: string; role: string },
  params: Record<string, string> = { id: "job-1" },
): ExecutionContext =>
  ({
    switchToHttp: () => ({ getRequest: () => ({ user, params }) }),
  }) as unknown as ExecutionContext;

describe("EmployerJobOwnershipGuard", () => {
  const job = { id: "job-1", employer: { userId: "owner-1" } };

  it("loads via findJobWithEmployerOwner and allows the owner", async () => {
    const findJobWithEmployerOwner = jest.fn().mockResolvedValue(job);
    const guard = new EmployerJobOwnershipGuard({
      findJobWithEmployerOwner,
    } as unknown as EmployerRepository);

    const context = makeContext({ id: "owner-1", role: "EMPLOYER" });
    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(findJobWithEmployerOwner).toHaveBeenCalledWith("job-1");
  });

  it("has no admin bypass — forbids a non-owner even if they're an admin", async () => {
    const findJobWithEmployerOwner = jest.fn().mockResolvedValue(job);
    const guard = new EmployerJobOwnershipGuard({
      findJobWithEmployerOwner,
    } as unknown as EmployerRepository);

    const context = makeContext({ id: "someone-else", role: "ADMIN" });
    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      ForbiddenApiException,
    );
  });
});
