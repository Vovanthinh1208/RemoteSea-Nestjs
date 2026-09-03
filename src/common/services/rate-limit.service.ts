import { Injectable } from "@nestjs/common";
import type { Request } from "express";
import { TooManyRequestsApiException } from "@/common/exceptions/api.exception";

type Bucket = { count: number; resetAt: number };

const CLEANUP_SIZE_THRESHOLD = 10_000;
// Throttles the sweep below to at most once per minute regardless of request
// volume — without this, once the store passes CLEANUP_SIZE_THRESHOLD, *every*
// request that lands on a fresh key re-triggers a full O(store.size) scan
// until enough entries happen to expire to drop back under the threshold.
// Under the exact load pattern this limiter exists to defend against (many
// distinct keys arriving in a short window, each with a live, unexpired
// bucket), that scan can re-run on every single request — the limiter
// blocking the event loop on every request is worse than the thing it's
// protecting against. A time-based throttle bounds the sweep's total cost
// independently of how many requests arrive while the store is oversized.
const CLEANUP_INTERVAL_MS = 60_000;

export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  retryAfter: number;
};

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      rateLimitInfo?: { limit: number; remaining: number };
    }
  }
}

/**
 * In-memory fixed-window limiter, scoped per process. Correct for a single
 * instance; behind multiple replicas each holds its own counters, so the
 * effective limit is roughly (configured limit × instance count) instead of
 * the configured value. There is no Redis (or other shared store) in this
 * repo yet — before running more than one instance, back this with one.
 */
@Injectable()
export class RateLimitService {
  private readonly store = new Map<string, Bucket>();
  // -Infinity, not 0 — this must always be "due" on the very first sweep
  // regardless of what `now` happens to be (a real epoch ms value in
  // production, but tests pass small synthetic values; `0` would wrongly
  // throttle the first sweep whenever `now` isn't already >=
  // CLEANUP_INTERVAL_MS).
  private lastCleanupAt = -Infinity;

  check(
    key: string,
    limit: number,
    windowMs: number,
    now: number = Date.now(),
  ): RateLimitResult {
    const bucket = this.store.get(key);

    if (!bucket || bucket.resetAt <= now) {
      this.store.set(key, { count: 1, resetAt: now + windowMs });
      this.maybeCleanup(now);
      return { allowed: true, remaining: limit - 1, retryAfter: 0 };
    }

    if (bucket.count >= limit) {
      return {
        allowed: false,
        remaining: 0,
        retryAfter: Math.ceil((bucket.resetAt - now) / 1000),
      };
    }

    bucket.count += 1;
    return { allowed: true, remaining: limit - bucket.count, retryAfter: 0 };
  }

  private maybeCleanup(now: number): void {
    if (
      this.store.size <= CLEANUP_SIZE_THRESHOLD ||
      now - this.lastCleanupAt < CLEANUP_INTERVAL_MS
    ) {
      return;
    }
    this.lastCleanupAt = now;
    this.store.forEach((bucket, key) => {
      if (bucket.resetAt <= now) this.store.delete(key);
    });
  }

  enforce(
    key: string,
    limit: number,
    windowMs: number,
    request?: Request,
  ): void {
    const result = this.check(key, limit, windowMs);
    if (!result.allowed) {
      throw new TooManyRequestsApiException(result.retryAfter);
    }
    if (request) {
      request.rateLimitInfo = { limit, remaining: result.remaining };
    }
  }
}

/**
 * Uses Express's own `req.ip`, which only reflects X-Forwarded-For/X-Real-IP
 * when `app.set("trust proxy", ...)` is explicitly configured for the actual
 * reverse proxy in front of this app. Trusting those headers unconditionally
 * (as this function previously did) let any client spoof its rate-limit key
 * by sending an arbitrary X-Forwarded-For value, bypassing the limiter entirely.
 */
export const clientIp = (request: Request): string => request.ip ?? "unknown";
