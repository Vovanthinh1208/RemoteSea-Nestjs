import type { Cache } from "@nestjs/cache-manager";

// Module-level, not per-call: shared across every getOrSetCache call site in
// the process (jobs:facets, salary:benchmarks, taxonomy:*) so concurrent
// misses on the same key — most likely right after a TTL expires under load —
// are deduped regardless of which service triggered them first.
const inFlight = new Map<string, Promise<unknown>>();

/**
 * Returns the cached value for `key`, or computes it, caches it for `ttlMs`,
 * and returns it.
 *
 * Concurrent misses for the same key share one in-flight compute() call
 * instead of each starting their own — without this, every request that lands
 * in the same cache-miss window independently re-runs the same (often
 * expensive) query, multiplying load at exactly the moment the cache was
 * supposed to prevent that.
 */
export const getOrSetCache = async <T>(
  cache: Cache,
  key: string,
  ttlMs: number,
  compute: () => Promise<T>,
): Promise<T> => {
  const cached = await cache.get<T>(key);
  if (cached !== undefined) return cached;

  const pending = inFlight.get(key);
  if (pending) return pending as Promise<T>;

  const promise = (async (): Promise<T> => {
    try {
      const value = await compute();
      await cache.set(key, value, ttlMs);
      return value;
    } finally {
      inFlight.delete(key);
    }
  })();

  inFlight.set(key, promise);
  return promise;
};
