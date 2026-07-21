import { randomUUID } from "crypto";
import type { NextFunction, Request, Response } from "express";

export const REQUEST_ID_HEADER = "x-request-id";

// Deliberately restrictive: this value is echoed back in a response header and
// written straight into log lines (see LoggingInterceptor), so an inbound value
// that doesn't match is discarded rather than sanitized/truncated — avoids log
// injection (newlines, control chars) from a client-supplied header.
const REQUEST_ID_PATTERN = /^[A-Za-z0-9_-]{1,100}$/;

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      id: string;
    }
  }
}

/**
 * Reuses an inbound x-request-id (set by an upstream load balancer/gateway) when
 * it's safe to log and propagate as-is; otherwise mints a fresh one. Pulled out
 * as a pure function so the id-selection rule is unit-testable without an
 * Express req/res.
 */
export const resolveRequestId = (
  headerValue: string | string[] | undefined,
): string => {
  const value = Array.isArray(headerValue) ? headerValue[0] : headerValue;
  if (value && REQUEST_ID_PATTERN.test(value)) return value;
  return randomUUID();
};

/**
 * Assigns req.id (a stable per-request correlation id used by LoggingInterceptor
 * and available to any handler/service that wants to tag its own logs) and
 * echoes it back so a caller — or an upstream proxy — can correlate a response
 * with server-side logs.
 */
export function requestIdMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const id = resolveRequestId(req.headers[REQUEST_ID_HEADER]);
  req.id = id;
  res.setHeader(REQUEST_ID_HEADER, id);
  next();
}
