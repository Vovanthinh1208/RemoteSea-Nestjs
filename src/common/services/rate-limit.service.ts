import { Injectable } from "@nestjs/common";
import type { Request } from "express";
import { TooManyRequestsApiException } from "@/common/exceptions/api.exception";

type Bucket = { count: number; resetAt: number };

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

  check(
    key: string,
    limit: number,
    windowMs: number,
    now: number = Date.now(),
  ): RateLimitResult {
    const bucket = this.store.get(key);

    if (!bucket || bucket.resetAt <= now) {
      this.store.set(key, { count: 1, resetAt: now + windowMs });
      if (this.store.size > 10_000) {
        this.store.forEach((b, k) => {
          if (b.resetAt <= now) this.store.delete(k);
        });
      }
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

  /**
   * Throws TooManyRequestsApiException if the bucket for `key` is exhausted.
   * When `request` is passed, stashes { limit, remaining } on it so
   * RateLimitHeadersInterceptor can surface X-RateLimit-* on a successful
   * response — previously the only signal a client ever got was Retry-After,
   * and only once it was already blocked.
   */
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
