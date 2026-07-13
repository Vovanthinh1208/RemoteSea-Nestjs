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
});
