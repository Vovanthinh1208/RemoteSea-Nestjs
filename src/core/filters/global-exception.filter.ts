import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  Logger,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import type { Response } from "express";
import {
  ApiException,
  TooManyRequestsApiException,
} from "@/common/exceptions/api.exception";
import { ErrorCode } from "@/common/exceptions/error-codes";

// Falls back to INTERNAL_ERROR for any status this map doesn't cover — those
// only ever reach here via a framework/library exception this app didn't
// throw itself, so there's no more specific code to give it.
const FALLBACK_CODE_BY_STATUS: Partial<Record<number, ErrorCode>> = {
  400: ErrorCode.BAD_REQUEST,
  401: ErrorCode.UNAUTHORIZED,
  403: ErrorCode.FORBIDDEN,
  404: ErrorCode.NOT_FOUND,
  409: ErrorCode.CONFLICT,
  429: ErrorCode.RATE_LIMITED,
};

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();

    if (exception instanceof TooManyRequestsApiException) {
      response
        .status(exception.getStatus())
        .set("Retry-After", String(exception.retryAfter))
        .json(exception.getResponse());
      return;
    }

    // Every exception application code throws is one of these — already the
    // { error, code } shape from its own constructor, pass through as-is.
    if (exception instanceof ApiException) {
      response.status(exception.getStatus()).json(exception.getResponse());
      return;
    }

    if (exception instanceof HttpException) {
      // Not one of ours: e.g. Nest's own 404 when no route matches a request
      // at all (thrown before any application code runs, so it can never be
      // an ApiException), or a framework/library exception. Without this,
      // these leaked Nest's default { statusCode, message, error } shape —
      // the one thing every other error response in this API deliberately
      // avoids.
      const status = exception.getStatus();
      const body = exception.getResponse();
      const message =
        typeof body === "object" && body !== null && "message" in body
          ? (body as { message: unknown }).message
          : exception.message;
      response.status(status).json({
        error: message,
        code: FALLBACK_CODE_BY_STATUS[status] ?? ErrorCode.INTERNAL_ERROR,
      });
      return;
    }

    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      switch (exception.code) {
        // Catches races that slip past an application-level check-then-write (e.g.
        // two concurrent "apply to job" requests) — without this, a unique-constraint
        // hit surfaces as a raw 500 instead of a normal 409.
        case "P2002":
          response.status(409).json({
            error: "Conflict — this record already exists",
            code: ErrorCode.CONFLICT,
          });
          return;
        // findUniqueOrThrow/findFirstOrThrow/deleteOrThrow-style calls throw this on
        // no match — treat it the same as an application-level not-found.
        case "P2025":
          response
            .status(404)
            .json({ error: "Not found", code: ErrorCode.NOT_FOUND });
          return;
        // Foreign key violation — the request references a record that doesn't exist.
        case "P2003":
          response.status(400).json({
            error: "Invalid reference — related record does not exist",
            code: ErrorCode.INVALID_REFERENCE,
          });
          return;
        // Would violate a required relation (e.g. deleting a record another required
        // relation still points to).
        case "P2014":
          response.status(409).json({
            error: "Conflict — operation violates a required relation",
            code: ErrorCode.CONFLICT,
          });
          return;
      }
    }

    // A Postgres CHECK constraint violation (e.g. jobs_salary_range_check,
    // talent_profiles_desired_salary_range_check — see the migration that
    // added them) on a *normal* Prisma Client call — not $queryRaw, which
    // would be P2010 instead — doesn't map to a known P-code in this Prisma
    // version (verified empirically against 5.22.0: it surfaces as
    // PrismaClientUnknownRequestError with no `.code` at all, just the raw
    // driver message). These constraints exist specifically to catch a race
    // that application-level validation on a pre-write read can't (two
    // concurrent partial updates to the same row, each individually valid
    // against a stale view of the other field) — without this, hitting that
    // race would 500 instead of giving the same clean 400 a non-racing
    // invalid request already gets from SalaryRange.create/merge.
    if (
      exception instanceof Prisma.PrismaClientUnknownRequestError &&
      exception.message.includes("salary_range_check")
    ) {
      response.status(400).json({
        error: "salaryMax must be greater than or equal to salaryMin",
        code: ErrorCode.SALARY_RANGE_INVALID,
      });
      return;
    }

    this.logger.error(exception instanceof Error ? exception.stack : exception);
    response
      .status(500)
      .json({ error: "Internal server error", code: ErrorCode.INTERNAL_ERROR });
  }
}
