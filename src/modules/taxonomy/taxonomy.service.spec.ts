import type { Cache } from "@nestjs/cache-manager";
import { TaxonomyService } from "./taxonomy.service";
import type { TaxonomyRepository } from "./taxonomy.repository";

const makeCache = (): Cache => {
  const store = new Map<string, unknown>();
  return {
    get: jest.fn(async (key: string) => store.get(key)),
    set: jest.fn(async (key: string, value: unknown) => {
      store.set(key, value);
    }),
  } as unknown as Cache;
};

describe("TaxonomyService.listCategories", () => {
  it("caches the result across calls instead of re-querying", async () => {
    const findAllCategories = jest.fn().mockResolvedValue([{ id: "cat-1" }]);
    const cache = makeCache();
    const service = new TaxonomyService(
      { findAllCategories } as unknown as TaxonomyRepository,
      cache,
    );

    await service.listCategories();
    await service.listCategories();

    expect(findAllCategories).toHaveBeenCalledTimes(1);
  });
});

describe("TaxonomyService.listSkills", () => {
  it("caches the unfiltered full list across calls", async () => {
    const findSkills = jest.fn().mockResolvedValue([{ id: "skill-a" }]);
    const cache = makeCache();
    const service = new TaxonomyService(
      { findSkills } as unknown as TaxonomyRepository,
      cache,
    );

    await service.listSkills();
    await service.listSkills();

    expect(findSkills).toHaveBeenCalledTimes(1);
  });

  it("never caches filtered searches — q is user input on a public endpoint", async () => {
    const findSkills = jest
      .fn()
      .mockResolvedValueOnce([{ id: "skill-a" }])
      .mockResolvedValueOnce([{ id: "skill-a" }]);
    const cache = makeCache();
    const service = new TaxonomyService(
      { findSkills } as unknown as TaxonomyRepository,
      cache,
    );

    await service.listSkills("react");
    await service.listSkills("react");

    // Repository hit both times, and nothing was written to the cache — a
    // flood of distinct q values must not grow the in-memory store.
    expect(findSkills).toHaveBeenCalledTimes(2);
    expect(cache.set).not.toHaveBeenCalled();
  });
});
