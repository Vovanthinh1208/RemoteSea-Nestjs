import type { Request } from "express";
import { RateLimitService } from "./rate-limit.service";
import { TooManyRequestsApiException } from "@/common/exceptions/api.exception";

describe("RateLimitService.check", () => {
  it("allows the first request in a window", () => {
    const service = new RateLimitService();
    const result = service.check("key", 5, 60_000);
    expect(result).toEqual({ allowed: true, remaining: 4, retryAfter: 0 });
  });

  it("blocks once the limit is exhausted within the window", () => {
    const service = new RateLimitService();
    const now = 1_000;
    for (let i = 0; i < 3; i += 1) service.check("key", 3, 60_000, now);

    const result = service.check("key", 3, 60_000, now + 1);
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
    expect(result.retryAfter).toBeGreaterThan(0);
  });

  it("resets the bucket once the window has elapsed", () => {
    const service = new RateLimitService();
    const now = 1_000;
    service.check("key", 1, 60_000, now);
    expect(service.check("key", 1, 60_000, now + 1).allowed).toBe(false);

    const result = service.check("key", 1, 60_000, now + 60_001);
    expect(result.allowed).toBe(true);
  });

  it("tracks separate buckets per key", () => {
    const service = new RateLimitService();
    const now = 1_000;
    service.check("a", 1, 60_000, now);
    expect(service.check("a", 1, 60_000, now).allowed).toBe(false);
    expect(service.check("b", 1, 60_000, now).allowed).toBe(true);
  });
});

describe("RateLimitService.enforce", () => {
  it("does not throw while under the limit", () => {
    const service = new RateLimitService();
    expect(() => service.enforce("key", 2, 60_000)).not.toThrow();
  });

  it("throws TooManyRequestsApiException once the limit is exceeded", () => {
    const service = new RateLimitService();
    service.enforce("key", 1, 60_000);
    expect(() => service.enforce("key", 1, 60_000)).toThrow(
      TooManyRequestsApiException,
    );
  });

  it("stashes { limit, remaining } on the request when one is passed", () => {
    const service = new RateLimitService();
    const request = {} as Request;
    service.enforce("key", 5, 60_000, request);
    expect(request.rateLimitInfo).toEqual({ limit: 5, remaining: 4 });
  });

  it("does not touch the request when the limit is exceeded", () => {
    const service = new RateLimitService();
    const request = {} as Request;
    service.enforce("key", 1, 60_000, request);
    expect(() => service.enforce("key", 1, 60_000, request)).toThrow(
      TooManyRequestsApiException,
    );
    // Still reflects the last successful check, not the rejected one.
    expect(request.rateLimitInfo).toEqual({ limit: 1, remaining: 0 });
  });
});
