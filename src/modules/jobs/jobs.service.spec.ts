import { JobsService } from "./jobs.service";
import {
  ForbiddenApiException,
  BadRequestApiException,
} from "@/common/exceptions/api.exception";
import type { JobsRepository } from "./jobs.repository";
import type { JobWithOwner } from "./guards/job-ownership.guard";
import type { AuthenticatedUser } from "@/common/interfaces/authenticated-user.interface";

// Ownership is enforced upstream by JobOwnershipGuard — these tests cover only
// what's left in the service: the admin bypass, the DRAFT/REJECTED-only editing
// rule, salary re-validation, and the atomic updateIfEditable re-check.

const baseJob = {
  id: "job-1",
  status: "DRAFT",
  salaryMin: 1000,
  salaryMax: 2000,
  employer: { userId: "owner-1" },
} as unknown as JobWithOwner;

const owner: AuthenticatedUser = {
  id: "owner-1",
  email: "owner@example.com",
  name: "Owner",
  role: "EMPLOYER",
};
const admin: AuthenticatedUser = {
  id: "admin-1",
  email: "admin@example.com",
  name: "Admin",
  role: "ADMIN",
};

const zeroFacetCounts = {
  jobtype_fulltime: 0,
  jobtype_contract: 0,
  jobtype_parttime: 0,
  seniority_entry: 0,
  seniority_mid: 0,
  seniority_senior: 0,
  tz_sea: 0,
  tz_async: 0,
  tz_sg: 0,
  tz_au: 0,
  tz_us: 0,
};

const makeService = (repoOverrides: Partial<JobsRepository> = {}) => {
  const repo = {
    update: jest.fn(),
    updateIfEditable: jest.fn(),
    findFacetCounts: jest.fn().mockResolvedValue(zeroFacetCounts),
    findCategoryFacetCounts: jest.fn().mockResolvedValue([]),
    ...repoOverrides,
  } as unknown as JobsRepository;
  const viewCounts = { record: jest.fn() };
  const cache = { get: jest.fn().mockResolvedValue(undefined), set: jest.fn() };
  return {
    service: new JobsService(
      repo,
      cache as never,
      viewCounts as never,
      {} as never,
    ),
    repo,
    cache,
  };
};

const job = (id: string) => ({ id }) as never;

describe("JobsService.update", () => {
  it("admins bypass the DRAFT/REJECTED restriction and write unconditionally", async () => {
    const { service, repo } = makeService({
      update: jest.fn().mockResolvedValue({ ...baseJob, status: "ACTIVE" }),
    });
    const activeJob = { ...baseJob, status: "ACTIVE" } as JobWithOwner;

    await service.update(activeJob, admin, { title: "New title" });
    expect(repo.update).toHaveBeenCalledWith("job-1", { title: "New title" });
  });

  it("rejects a non-admin editing a job that isn't DRAFT or REJECTED", async () => {
    const { service } = makeService();
    const activeJob = { ...baseJob, status: "ACTIVE" } as JobWithOwner;

    await expect(
      service.update(activeJob, owner, { title: "New title" }),
    ).rejects.toBeInstanceOf(ForbiddenApiException);
  });

  it("rejects a salary update where the effective max would be below the effective min", async () => {
    const { service } = makeService();

    await expect(
      service.update(baseJob, owner, { salaryMax: 500 }),
    ).rejects.toBeInstanceOf(BadRequestApiException);
  });

  it("writes via updateIfEditable for a valid non-admin edit", async () => {
    const updated = { ...baseJob, title: "New title" };
    const { service, repo } = makeService({
      updateIfEditable: jest.fn().mockResolvedValue(updated),
    });

    const result = await service.update(baseJob, owner, { title: "New title" });
    expect(repo.updateIfEditable).toHaveBeenCalledWith("job-1", {
      title: "New title",
    });
    expect(result).toBe(updated);
  });

  it("throws Forbidden when updateIfEditable finds the job was concurrently made non-editable", async () => {
    const { service } = makeService({
      updateIfEditable: jest.fn().mockResolvedValue(null),
    });

    await expect(
      service.update(baseJob, owner, { title: "New title" }),
    ).rejects.toBeInstanceOf(ForbiddenApiException);
  });
});

describe("JobsService.list", () => {
  it("without q, lists/counts by the normal filter+orderBy path", async () => {
    const findMany = jest.fn().mockResolvedValue([job("a")]);
    const count = jest.fn().mockResolvedValue(1);
    const { service } = makeService({ findMany, count });

    const result = await service.list({ page: 1, limit: 20 } as never);

    expect(result.jobs).toEqual([job("a")]);
    expect(result.pagination.total).toBe(1);
    // No q means findSearchRankedIds must never run — the filter path never
    // touches the ranking query at all.
  });

  it("with q, returns empty immediately if nothing matches — never calls findMany", async () => {
    const findSearchRankedIds = jest.fn().mockResolvedValue([]);
    const findMany = jest.fn();
    const { service } = makeService({ findSearchRankedIds, findMany });

    const result = await service.list({
      page: 1,
      limit: 20,
      q: "nonexistent",
    } as never);

    expect(result.jobs).toEqual([]);
    expect(result.pagination.total).toBe(0);
    expect(findMany).not.toHaveBeenCalled();
  });

  it("with q and no explicit sort, re-orders matches by rank (not DB order) and paginates in JS", async () => {
    const findSearchRankedIds = jest
      .fn()
      .mockResolvedValue(["best", "mid", "worst"]);
    // All three ranked candidates also satisfy the other filters.
    const findIds = jest.fn().mockResolvedValue(["best", "mid", "worst"]);
    // Deliberately returned in a different order than rankedIds, the way an
    // unordered Postgres `id IN (...)` scan would.
    const findMany = jest
      .fn()
      .mockResolvedValue([job("worst"), job("best"), job("mid")]);
    const { service } = makeService({ findSearchRankedIds, findIds, findMany });

    const result = await service.list({
      page: 1,
      limit: 20,
      q: "engineer",
    } as never);

    expect(findMany).toHaveBeenCalledWith(
      { id: { in: ["best", "mid", "worst"] } },
      0,
      3,
    );
    expect(result.jobs).toEqual([job("best"), job("mid"), job("worst")]);
    expect(result.pagination.total).toBe(3);
  });

  it("with q and no explicit sort, drops ranked candidates that fail the other filters and paginates the survivors", async () => {
    const findSearchRankedIds = jest
      .fn()
      .mockResolvedValue(["best", "mid", "worst"]);
    // "mid" matched the search but not the other filters (e.g. country) —
    // findIds is the source of truth for which candidates survive.
    const findIds = jest.fn().mockResolvedValue(["best", "worst"]);
    const findMany = jest.fn().mockResolvedValue([job("best")]);
    const { service } = makeService({ findSearchRankedIds, findIds, findMany });

    const result = await service.list({
      page: 1,
      limit: 1,
      q: "engineer",
    } as never);

    expect(findMany).toHaveBeenCalledWith({ id: { in: ["best"] } }, 0, 1);
    expect(result.jobs).toEqual([job("best")]);
    expect(result.pagination.total).toBe(2);
  });

  it("with q and an explicit sort=salary, honors the explicit sort over relevance", async () => {
    const findSearchRankedIds = jest.fn().mockResolvedValue(["a", "b"]);
    const findMany = jest.fn().mockResolvedValue([job("b"), job("a")]);
    const count = jest.fn().mockResolvedValue(2);
    const { service } = makeService({
      findSearchRankedIds,
      findMany,
      count,
    });

    const result = await service.list({
      page: 1,
      limit: 20,
      q: "engineer",
      sort: "salary",
    } as never);

    // DB-ordered result is trusted as-is (not re-sorted by rank) once an
    // explicit sort is given.
    expect(result.jobs).toEqual([job("b"), job("a")]);
    expect(count).toHaveBeenCalled();
  });
});
