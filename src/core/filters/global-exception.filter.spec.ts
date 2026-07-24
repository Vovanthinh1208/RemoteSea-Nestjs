import type { ArgumentsHost } from "@nestjs/common";
import { HttpException, HttpStatus, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { GlobalExceptionFilter } from "./global-exception.filter";
import {
  NotFoundApiException,
  TooManyRequestsApiException,
} from "@/common/exceptions/api.exception";
import { ErrorCode } from "@/common/exceptions/error-codes";

const makeHost = () => {
  const response = {
    status: jest.fn().mockReturnThis(),
    set: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  };
  const host = {
    switchToHttp: () => ({ getResponse: () => response }),
  } as unknown as ArgumentsHost;
  return { host, response };
};

describe("GlobalExceptionFilter", () => {
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
});
