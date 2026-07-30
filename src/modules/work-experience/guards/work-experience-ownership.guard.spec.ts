import type { ExecutionContext } from "@nestjs/common";
import { WorkExperienceOwnershipGuard } from "./work-experience-ownership.guard";
import { NotFoundApiException } from "@/common/exceptions/api.exception";
import type { WorkExperienceRepository } from "../work-experience.repository";

const makeContext = (
  user: { id: string; role: string },
  params: Record<string, string> = { id: "exp-1" },
): ExecutionContext =>
  ({
    switchToHttp: () => ({ getRequest: () => ({ user, params }) }),
  }) as unknown as ExecutionContext;

describe("WorkExperienceOwnershipGuard", () => {
  const experience = {
    id: "exp-1",
    talentId: "talent-1",
    talent: { userId: "owner-1" },
  };

  it("loads the entry via findOwnerById and allows the owner", async () => {
    const findOwnerById = jest.fn().mockResolvedValue(experience);
    const guard = new WorkExperienceOwnershipGuard({
      findOwnerById,
    } as unknown as WorkExperienceRepository);

    const context = makeContext({ id: "owner-1", role: "TALENT" });
    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(findOwnerById).toHaveBeenCalledWith("exp-1");
  });

  it("throws NotFound (not Forbidden) for a non-owner, so existence isn't leaked", async () => {
    const findOwnerById = jest.fn().mockResolvedValue(experience);
    const guard = new WorkExperienceOwnershipGuard({
      findOwnerById,
    } as unknown as WorkExperienceRepository);

    const context = makeContext({ id: "someone-else", role: "TALENT" });
    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      NotFoundApiException,
    );
  });

  it("throws NotFound when the entry doesn't exist", async () => {
    const findOwnerById = jest.fn().mockResolvedValue(null);
    const guard = new WorkExperienceOwnershipGuard({
      findOwnerById,
    } as unknown as WorkExperienceRepository);

    const context = makeContext({ id: "owner-1", role: "TALENT" });
    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      NotFoundApiException,
    );
  });
});
