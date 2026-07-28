import { Prisma } from "@prisma/client";
import { ApplicationsService } from "./applications.service";
import type { ApplicationsRepository } from "./applications.repository";
import type { ApplicationWithJob } from "./interfaces";
import { ConflictApiException } from "@/common/exceptions/api.exception";
import { ErrorCode } from "@/common/exceptions/error-codes";

const makeService = (repoOverrides: Partial<ApplicationsRepository> = {}) => {
  const repo = { ...repoOverrides } as unknown as ApplicationsRepository;
  return new ApplicationsService(repo, {} as never, {} as never);
};

describe("ApplicationsService.findAllForUser", () => {
  it("returns an empty paginated envelope when the user has no talent profile", async () => {
    const service = makeService({
      findTalentIdByUserId: jest.fn().mockResolvedValue(null),
    });

    const result = await service.findAllForUser("user-1", 1, 20);
    expect(result).toEqual({
      applications: [],
      pagination: { page: 1, limit: 20, total: 0, pages: 0 },
    });
  });

  it("converts page/limit to skip and wraps the result in a pagination envelope", async () => {
    const rows = [{ id: "app-1" } as unknown as ApplicationWithJob];
    const findByTalentId = jest.fn().mockResolvedValue([rows, 12]);
    const service = makeService({
      findTalentIdByUserId: jest.fn().mockResolvedValue({ id: "talent-1" }),
      findByTalentId,
    });

    const result = await service.findAllForUser("user-1", 2, 5);

    expect(findByTalentId).toHaveBeenCalledWith("talent-1", 5, 5);
    expect(result).toEqual({
      applications: rows,
      pagination: { page: 2, limit: 5, total: 12, pages: 3 },
    });
  });
});

describe("ApplicationsService.getStatusCounts", () => {
  it("returns all-zero counts when the user has no talent profile", async () => {
    const service = makeService({
      findTalentIdByUserId: jest.fn().mockResolvedValue(null),
    });

    const result = await service.getStatusCounts("user-1");
    expect(result.total).toBe(0);
    expect(result.byStatus.PENDING).toBe(0);
  });

  it("shapes the repository's groupBy rows into totals", async () => {
    const service = makeService({
      findTalentIdByUserId: jest.fn().mockResolvedValue({ id: "talent-1" }),
      getStatusCountsByTalentId: jest
        .fn()
        .mockResolvedValue([{ status: "OFFERED", count: 4 }]),
    });

    const result = await service.getStatusCounts("user-1");
    expect(result.total).toBe(4);
    expect(result.byStatus.OFFERED).toBe(4);
  });
});

describe("ApplicationsService.apply", () => {
  it("maps a P2002 race on the unique (jobId, talentId) constraint to ALREADY_APPLIED, not a generic conflict", async () => {
    const service = makeService({
      findTalentWithUserName: jest
        .fn()
        .mockResolvedValue({ id: "talent-1", user: { name: "Talent" } }),
      // Fast path sees no existing row — a concurrent duplicate request
      // still races past this and hits the DB constraint below.
      findByJobAndTalent: jest.fn().mockResolvedValue(null),
      createAndIncrementApplyCount: jest.fn().mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError("duplicate", {
          code: "P2002",
          clientVersion: "5.22.0",
        }),
      ),
    });

    const error = await service
      .apply("user-1", { jobId: "job-1" } as never)
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ConflictApiException);
    expect((error as ConflictApiException).getResponse()).toMatchObject({
      code: ErrorCode.ALREADY_APPLIED,
    });
  });
});
