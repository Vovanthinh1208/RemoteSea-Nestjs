import type { ArgumentsHost } from "@nestjs/common";
import { HttpException, HttpStatus, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { GlobalExceptionFilter } from "./global-exception.filter";
import {
  NotFoundApiException,
  TooManyRequestsApiException,
} from "@/common/exceptions/api.exception";
import { ErrorCode } from "@/common/exceptions/error-codes";
import { reportException } from "@/core/observability/sentry";

jest.mock("@/core/observability/sentry", () => ({
  reportException: jest.fn(),
}));

const makeHost = (request: { id?: string; user?: { id: string } } = {}) => {
  const response = {
    status: jest.fn().mockReturnThis(),
    set: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  };
  const host = {
    switchToHttp: () => ({
      getResponse: () => response,
      getRequest: () => request,
    }),
  } as unknown as ArgumentsHost;
  return { host, response };
};

describe("GlobalExceptionFilter", () => {
  // reportException is mocked file-wide (see jest.mock above) — several
  // tests below exercise the 500 fallback path that calls it, so its call
  // history has to be cleared between tests or a later assertion on "was
  // this called" inherits calls left over from an earlier, unrelated test.
  afterEach(() => jest.clearAllMocks());

  it("passes an ApiException through with its own { error, code } body", () => {
    const filter = new GlobalExceptionFilter();
    const { host, response } = makeHost();

    filter.catch(
      new NotFoundApiException("Job not found", ErrorCode.JOB_NOT_FOUND),
      host,
    );

    expect(response.status).toHaveBeenCalledWith(404);
    expect(response.json).toHaveBeenCalledWith({
      error: "Job not found",
      code: ErrorCode.JOB_NOT_FOUND,
    });
  });

  it("stamps the request's id onto an ApiException's error body for support/log correlation", () => {
    const filter = new GlobalExceptionFilter();
    const { host, response } = makeHost({ id: "req-1" });

    filter.catch(
      new NotFoundApiException("Job not found", ErrorCode.JOB_NOT_FOUND),
      host,
    );

    expect(response.json).toHaveBeenCalledWith({
      error: "Job not found",
      code: ErrorCode.JOB_NOT_FOUND,
      requestId: "req-1",
    });
  });

  it("sets Retry-After for TooManyRequestsApiException", () => {
    const filter = new GlobalExceptionFilter();
    const { host, response } = makeHost();

    filter.catch(new TooManyRequestsApiException(42), host);

    expect(response.status).toHaveBeenCalledWith(429);
    expect(response.set).toHaveBeenCalledWith("Retry-After", "42");
    expect(response.json).toHaveBeenCalledWith(
      expect.objectContaining({ code: ErrorCode.RATE_LIMITED }),
    );
  });

  it("normalizes a non-ApiException HttpException (e.g. no route matched) to { error, code }", () => {
    const filter = new GlobalExceptionFilter();
    const { host, response } = makeHost();

    // This is exactly what Nest itself throws when no controller matches the
    // request path — the live, reachable case this normalization exists for.
    filter.catch(new NotFoundException("Cannot GET /nonexistent"), host);

    expect(response.status).toHaveBeenCalledWith(404);
    expect(response.json).toHaveBeenCalledWith({
      error: "Cannot GET /nonexistent",
      code: ErrorCode.NOT_FOUND,
    });
  });

  it("falls back to INTERNAL_ERROR for an HttpException status with no specific mapping", () => {
    const filter = new GlobalExceptionFilter();
    const { host, response } = makeHost();

    filter.catch(new HttpException("teapot", HttpStatus.I_AM_A_TEAPOT), host);

    expect(response.status).toHaveBeenCalledWith(418);
    expect(response.json).toHaveBeenCalledWith({
      error: "teapot",
      code: ErrorCode.INTERNAL_ERROR,
    });
  });

  it("extracts FastAPI's `detail` field when `message` is absent (proxied remotesea-ai error)", () => {
    const filter = new GlobalExceptionFilter();
    const { host, response } = makeHost();

    // The exact shape AiOrchestratorService.proxyToOrchestrator produces
    // from remotesea-ai's raw FastAPI error body.
    filter.catch(
      new HttpException(
        { detail: "RAG retrieval failed: connection refused" },
        HttpStatus.BAD_GATEWAY,
      ),
      host,
    );

    expect(response.status).toHaveBeenCalledWith(502);
    expect(response.json).toHaveBeenCalledWith({
      error: "RAG retrieval failed: connection refused",
      code: ErrorCode.SERVICE_UNAVAILABLE,
    });
  });

  it("maps Prisma P2002 to a 409 conflict", () => {
    const filter = new GlobalExceptionFilter();
    const { host, response } = makeHost();

    const error = new Prisma.PrismaClientKnownRequestError("duplicate", {
      code: "P2002",
      clientVersion: "5.22.0",
    });
    filter.catch(error, host);

    expect(response.status).toHaveBeenCalledWith(409);
    expect(response.json).toHaveBeenCalledWith(
      expect.objectContaining({ code: ErrorCode.CONFLICT }),
    );
  });

  it("maps Prisma P2025 (record not found) to a 404", () => {
    const filter = new GlobalExceptionFilter();
    const { host, response } = makeHost();

    const error = new Prisma.PrismaClientKnownRequestError("not found", {
      code: "P2025",
      clientVersion: "5.22.0",
    });
    filter.catch(error, host);

    expect(response.status).toHaveBeenCalledWith(404);
    expect(response.json).toHaveBeenCalledWith(
      expect.objectContaining({ code: ErrorCode.NOT_FOUND }),
    );
  });

  it("maps Prisma P2003 (foreign key violation) to a 400", () => {
    const filter = new GlobalExceptionFilter();
    const { host, response } = makeHost();

    const error = new Prisma.PrismaClientKnownRequestError("fk violation", {
      code: "P2003",
      clientVersion: "5.22.0",
    });
    filter.catch(error, host);

    expect(response.status).toHaveBeenCalledWith(400);
    expect(response.json).toHaveBeenCalledWith(
      expect.objectContaining({ code: ErrorCode.INVALID_REFERENCE }),
    );
  });

  it("maps a salary-range CHECK constraint violation to a 400, not the generic 500 fallback", () => {
    const filter = new GlobalExceptionFilter();
    const { host, response } = makeHost();

    // Reproduces the exact shape observed empirically against Prisma
    // 5.22.0: a CHECK constraint violation on a normal (non-$queryRaw)
    // Prisma Client call has no known P-code, just this error class with
    // the raw driver message.
    const error = new Prisma.PrismaClientUnknownRequestError(
      'Error occurred during query execution: ... violates check constraint "jobs_salary_range_check" ...',
      { clientVersion: "5.22.0" },
    );
    filter.catch(error, host);

    expect(response.status).toHaveBeenCalledWith(400);
    expect(response.json).toHaveBeenCalledWith(
      expect.objectContaining({ code: ErrorCode.SALARY_RANGE_INVALID }),
    );
  });

  it("falls back to a generic 500 for an unrelated PrismaClientUnknownRequestError", () => {
    const filter = new GlobalExceptionFilter();
    const { host, response } = makeHost();

    const error = new Prisma.PrismaClientUnknownRequestError(
      "connection reset",
      {
        clientVersion: "5.22.0",
      },
    );
    filter.catch(error, host);

    expect(response.status).toHaveBeenCalledWith(500);
  });

  it("falls back to a generic 500 for an unrecognized Prisma error code", () => {
    const filter = new GlobalExceptionFilter();
    const { host, response } = makeHost();

    const error = new Prisma.PrismaClientKnownRequestError("weird", {
      code: "P9999",
      clientVersion: "5.22.0",
    });
    filter.catch(error, host);

    expect(response.status).toHaveBeenCalledWith(500);
    expect(response.json).toHaveBeenCalledWith({
      error: "Internal server error",
      code: ErrorCode.INTERNAL_ERROR,
    });
  });

  it("falls back to a generic 500 for a completely unrecognized error", () => {
    const filter = new GlobalExceptionFilter();
    const { host, response } = makeHost();

    filter.catch(new Error("boom"), host);

    expect(response.status).toHaveBeenCalledWith(500);
    expect(response.json).toHaveBeenCalledWith({
      error: "Internal server error",
      code: ErrorCode.INTERNAL_ERROR,
    });
  });

  it("includes the request's id in the generic 500 fallback body", () => {
    const filter = new GlobalExceptionFilter();
    const { host, response } = makeHost({ id: "req-1" });

    filter.catch(new Error("boom"), host);

    expect(response.json).toHaveBeenCalledWith({
      error: "Internal server error",
      code: ErrorCode.INTERNAL_ERROR,
      requestId: "req-1",
    });
  });

  describe("Sentry reporting for unrecognized errors", () => {
    // Only the true 500 fallback ever reaches Sentry — every other branch in
    // this file (ApiException, known Prisma codes, ...) is an expected,
    // already-classified condition, and sending those too would drown the
    // real signal in noise generated by completely normal 400/404 traffic.
    it("does not report a recognized ApiException to Sentry", () => {
      const { host } = makeHost();
      new GlobalExceptionFilter().catch(
        new NotFoundApiException("Job not found", ErrorCode.JOB_NOT_FOUND),
        host,
      );
      expect(reportException).not.toHaveBeenCalled();
    });

    it("reports an unrecognized error to Sentry with the request's id and user id for correlation", () => {
      const { host } = makeHost({ id: "req-1", user: { id: "user-1" } });
      const error = new Error("boom");

      new GlobalExceptionFilter().catch(error, host);

      expect(reportException).toHaveBeenCalledWith(error, {
        requestId: "req-1",
        userId: "user-1",
      });
    });

    it("reports with an undefined userId for an unauthenticated request", () => {
      const { host } = makeHost({ id: "req-1" });
      const error = new Error("boom");

      new GlobalExceptionFilter().catch(error, host);

      expect(reportException).toHaveBeenCalledWith(error, {
        requestId: "req-1",
        userId: undefined,
      });
    });
  });
});
