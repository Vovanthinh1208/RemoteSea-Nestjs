import type { ExecutionContext } from "@nestjs/common";
import { AlertOwnershipGuard } from "./alert-ownership.guard";
import { NotFoundApiException } from "@/common/exceptions/api.exception";
import type { AlertsRepository } from "../alerts.repository";

const makeContext = (
  user: { id: string; role: string },
  params: Record<string, string> = { id: "alert-1" },
): ExecutionContext =>
  ({
    switchToHttp: () => ({ getRequest: () => ({ user, params }) }),
  }) as unknown as ExecutionContext;

describe("AlertOwnershipGuard", () => {
  const alert = { id: "alert-1", userId: "owner-1" };

  it("loads the alert via findOwnerById and allows the owner", async () => {
    const findOwnerById = jest.fn().mockResolvedValue(alert);
    const guard = new AlertOwnershipGuard({
      findOwnerById,
    } as unknown as AlertsRepository);

    const context = makeContext({ id: "owner-1", role: "TALENT" });
    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(findOwnerById).toHaveBeenCalledWith("alert-1");
  });

  it("throws NotFound (not Forbidden) for a non-owner, matching the original assertOwnership behavior", async () => {
    const findOwnerById = jest.fn().mockResolvedValue(alert);
    const guard = new AlertOwnershipGuard({
      findOwnerById,
    } as unknown as AlertsRepository);

    const context = makeContext({ id: "someone-else", role: "TALENT" });
    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      NotFoundApiException,
    );
  });

  it("throws NotFound when the alert doesn't exist", async () => {
    const findOwnerById = jest.fn().mockResolvedValue(null);
    const guard = new AlertOwnershipGuard({
      findOwnerById,
    } as unknown as AlertsRepository);

    const context = makeContext({ id: "owner-1", role: "TALENT" });
    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      NotFoundApiException,
    );
  });
});
