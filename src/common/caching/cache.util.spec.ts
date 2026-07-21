import type { Cache } from "@nestjs/cache-manager";
import { getOrSetCache } from "./cache.util";

const makeCache = (initial?: Record<string, unknown>): Cache => {
  const store = new Map<string, unknown>(Object.entries(initial ?? {}));
  return {
    get: jest.fn(async (key: string) => store.get(key)),
    set: jest.fn(async (key: string, value: unknown) => {
      store.set(key, value);
    }),
  } as unknown as Cache;
};

describe("getOrSetCache", () => {
  it("computes and caches the value on a miss", async () => {
    const cache = makeCache();
    const compute = jest.fn().mockResolvedValue({ value: 42 });

    const result = await getOrSetCache(cache, "key", 1000, compute);

    expect(result).toEqual({ value: 42 });
    expect(compute).toHaveBeenCalledTimes(1);
    expect(cache.set).toHaveBeenCalledWith("key", { value: 42 }, 1000);
  });

  it("returns the cached value on a hit without recomputing", async () => {
    const cache = makeCache({ key: { value: 7 } });
    const compute = jest.fn();

    const result = await getOrSetCache(cache, "key", 1000, compute);

    expect(result).toEqual({ value: 7 });
    expect(compute).not.toHaveBeenCalled();
  });

  it("dedupes concurrent misses on the same key into one compute() call", async () => {
    const cache = makeCache();
    const compute = jest.fn().mockResolvedValue({ value: 99 });

    // Both calls start executing synchronously up to their first internal
    // await (cache.get) before either has checked the in-flight map — the
    // same race that happens under real concurrent traffic on a cache miss.
    const [firstResult, secondResult] = await Promise.all([
      getOrSetCache(cache, "stampede-key", 1000, compute),
      getOrSetCache(cache, "stampede-key", 1000, compute),
    ]);

    expect(compute).toHaveBeenCalledTimes(1);
    expect(firstResult).toEqual({ value: 99 });
    expect(secondResult).toEqual({ value: 99 });
    expect(cache.set).toHaveBeenCalledTimes(1);
  });

  it("starts a fresh compute() for the same key after the previous one settled", async () => {
    const cache = makeCache();
    const compute = jest
      .fn()
      .mockResolvedValueOnce({ value: 1 })
      .mockResolvedValueOnce({ value: 2 });

    await getOrSetCache(cache, "sequential-key", 1000, compute);
    // Force a second miss (this fake store has no TTL of its own) to prove
    // the in-flight entry was cleaned up after the first call settled,
    // instead of incorrectly deduping an unrelated later miss forever.
    (cache.get as jest.Mock).mockResolvedValueOnce(undefined);
    await getOrSetCache(cache, "sequential-key", 1000, compute);

    expect(compute).toHaveBeenCalledTimes(2);
  });
});
