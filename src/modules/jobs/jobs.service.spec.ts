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
  employerId: "owner-1-company",
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
      {} as never,
    ),
    repo,
    cache,
  };
};

const job = (id: string) => ({ id }) as never;

describe("JobsService.update", () => {
  it("does not special-case ADMIN: an ACTIVE job is not editable for anyone (PB42 RC3)", async () => {
    const { service, repo } = makeService();
    const activeJob = { ...baseJob, status: "ACTIVE" } as JobWithOwner;

    await expect(
      service.update(activeJob, admin, { title: "New title" }),
    ).rejects.toBeInstanceOf(ForbiddenApiException);
    expect(repo.update).not.toHaveBeenCalled();
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

describe("JobsService.closeJob", () => {
  it("closes an ACTIVE job", async () => {
    const activeJob = { ...baseJob, status: "ACTIVE" } as JobWithOwner;
    const { service, repo } = makeService({
      closeJob: jest.fn().mockResolvedValue({ status: "CLOSED" }),
    });

    const result = await service.closeJob(activeJob);

    expect(repo.closeJob).toHaveBeenCalledWith("job-1");
    expect(result).toEqual({ status: "CLOSED" });
  });

  // Unlike update(), there's no admin bypass here — closing only makes
  // sense starting from ACTIVE regardless of who's asking.
  it("rejects closing a job that isn't ACTIVE, even for an admin caller", async () => {
    const { service, repo } = makeService({ closeJob: jest.fn() });

    await expect(service.closeJob(baseJob)).rejects.toBeInstanceOf(
      ForbiddenApiException,
    );
    expect(repo.closeJob).not.toHaveBeenCalled();
  });

  it("throws Forbidden when the atomic re-check finds the job was concurrently made non-active (e.g. expired)", async () => {
    const activeJob = { ...baseJob, status: "ACTIVE" } as JobWithOwner;
    const { service } = makeService({
      closeJob: jest.fn().mockResolvedValue(null),
    });

    await expect(service.closeJob(activeJob)).rejects.toBeInstanceOf(
      ForbiddenApiException,
    );
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

  it("with q, returns empty immediately if no job satisfies the other filters — never ranks or fetches", async () => {
    // findIds resolves every non-`q` filter first (see JobsService.listBySearch)
    // — an empty result here means there's nothing to rank at all.
    const findIds = jest.fn().mockResolvedValue([]);
    const findSearchRankedIds = jest.fn();
    const findMany = jest.fn();
    const { service } = makeService({ findIds, findSearchRankedIds, findMany });

    const result = await service.list({
      page: 1,
      limit: 20,
      q: "nonexistent",
    } as never);

    expect(result.jobs).toEqual([]);
    expect(result.pagination.total).toBe(0);
    expect(findSearchRankedIds).not.toHaveBeenCalled();
    expect(findMany).not.toHaveBeenCalled();
  });

  it("with q, returns empty if candidates exist but none match the search text", async () => {
    const findIds = jest.fn().mockResolvedValue(["a", "b"]);
    const findSearchRankedIds = jest.fn().mockResolvedValue([]);
    const findMany = jest.fn();
    const { service } = makeService({ findIds, findSearchRankedIds, findMany });

    const result = await service.list({
      page: 1,
      limit: 20,
      q: "nonexistent",
    } as never);

    expect(result.jobs).toEqual([]);
    expect(result.pagination.total).toBe(0);
    expect(findMany).not.toHaveBeenCalled();
  });

  it("with q and no explicit sort, ranks only within the ids the other filters already matched, then re-orders matches by rank (not DB order) and paginates in JS", async () => {
    const findIds = jest.fn().mockResolvedValue(["best", "mid", "worst"]);
    const findSearchRankedIds = jest
      .fn()
      .mockResolvedValue(["best", "mid", "worst"]);
    // Deliberately returned in a different order than rankedIds, the way an
    // unordered Postgres `id IN (...)` scan would.
    const findMany = jest
      .fn()
      .mockResolvedValue([job("worst"), job("best"), job("mid")]);
    const { service } = makeService({ findIds, findSearchRankedIds, findMany });

    const result = await service.list({
      page: 1,
      limit: 20,
      q: "engineer",
    } as never);

    // Ranking is scoped to the pre-filtered candidate set, not a table-wide
    // scan — see buildSearchRankedIdsQuery for why this ordering fixed the
    // old undercounted-total bug.
    expect(findSearchRankedIds).toHaveBeenCalledWith("engineer", [
      "best",
      "mid",
      "worst",
    ]);
    expect(findMany).toHaveBeenCalledWith(
      { id: { in: ["best", "mid", "worst"] } },
      0,
      3,
    );
    expect(result.jobs).toEqual([job("best"), job("mid"), job("worst")]);
    expect(result.pagination.total).toBe(3);
  });

  it("with q and no explicit sort, total reflects every ranked match (not a capped scan) and pagination slices the id list before fetching", async () => {
    const findIds = jest.fn().mockResolvedValue(["best", "mid", "worst"]);
    // Only 2 of the 3 filter-matching candidates also match the search text.
    const findSearchRankedIds = jest.fn().mockResolvedValue(["best", "worst"]);
    const findMany = jest.fn().mockResolvedValue([job("best")]);
    const { service } = makeService({ findIds, findSearchRankedIds, findMany });

    const result = await service.list({
      page: 1,
      limit: 1,
      q: "engineer",
    } as never);

    expect(findMany).toHaveBeenCalledWith({ id: { in: ["best"] } }, 0, 1);
    expect(result.jobs).toEqual([job("best")]);
    expect(result.pagination.total).toBe(2);
  });

  it("with q and an explicit sort=salary, honors the explicit sort over relevance and derives total from rankedIds with no separate count query", async () => {
    const findIds = jest.fn().mockResolvedValue(["a", "b"]);
    const findSearchRankedIds = jest.fn().mockResolvedValue(["a", "b"]);
    const findMany = jest.fn().mockResolvedValue([job("b"), job("a")]);
    const count = jest.fn();
    const { service } = makeService({
      findIds,
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
    expect(result.pagination.total).toBe(2);
    // rankedIds is already the full filtered+matched set, so there's nothing
    // left for a count query to compute — one fewer DB round trip than before.
    expect(count).not.toHaveBeenCalled();
  });
});
