import type { Cache } from "@nestjs/cache-manager";

/** Returns the cached value for `key`, or computes it, caches it for `ttlMs`, and returns it. */
export const getOrSetCache = async <T>(
  cache: Cache,
  key: string,
  ttlMs: number,
  compute: () => Promise<T>,
): Promise<T> => {
  const cached = await cache.get<T>(key);
  if (cached !== undefined) return cached;

  const value = await compute();
  await cache.set(key, value, ttlMs);
  return value;
};
