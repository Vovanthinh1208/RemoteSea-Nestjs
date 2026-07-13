import type { ExecutionContext } from "@nestjs/common";
import { ApplicationOwnershipGuard } from "./application-ownership.guard";
import { ForbiddenApiException } from "@/common/exceptions/api.exception";
import type { EmployerRepository } from "../employer.repository";

const makeContext = (
  user: { id: string; role: string },
  params: Record<string, string> = { id: "app-1" },
): ExecutionContext =>
  ({
    switchToHttp: () => ({ getRequest: () => ({ user, params }) }),
  }) as unknown as ExecutionContext;

describe("ApplicationOwnershipGuard", () => {
  const application = {
    id: "app-1",
    status: "PENDING",
    job: { employer: { userId: "owner-1" } },
  };

  it("loads via findApplicationWithJobOwner and compares job.employer.userId", async () => {
    const findApplicationWithJobOwner = jest
      .fn()
      .mockResolvedValue(application);
    const guard = new ApplicationOwnershipGuard({
      findApplicationWithJobOwner,
    } as unknown as EmployerRepository);

    const context = makeContext({ id: "owner-1", role: "EMPLOYER" });
    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(findApplicationWithJobOwner).toHaveBeenCalledWith("app-1");
  });

  it("forbids a non-owner", async () => {
    const findApplicationWithJobOwner = jest
      .fn()
      .mockResolvedValue(application);
    const guard = new ApplicationOwnershipGuard({
      findApplicationWithJobOwner,
    } as unknown as EmployerRepository);

    const context = makeContext({ id: "someone-else", role: "EMPLOYER" });
    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      ForbiddenApiException,
    );
  });
});
