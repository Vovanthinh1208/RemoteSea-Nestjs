import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  Logger,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import type { Response } from "express";
import { TooManyRequestsApiException } from "@/common/exceptions/api.exception";

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

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();
      response
        .status(status)
        .json(
          typeof body === "object" && body !== null ? body : { error: body },
        );
      return;
    }

    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      switch (exception.code) {
        // Catches races that slip past an application-level check-then-write (e.g.
        // two concurrent "apply to job" requests) — without this, a unique-constraint
        // hit surfaces as a raw 500 instead of a normal 409.
        case "P2002":
          response
            .status(409)
            .json({
              error: "Conflict — this record already exists",
              code: "CONFLICT",
            });
          return;
        // findUniqueOrThrow/findFirstOrThrow/deleteOrThrow-style calls throw this on
        // no match — treat it the same as an application-level not-found.
        case "P2025":
          response.status(404).json({ error: "Not found", code: "NOT_FOUND" });
          return;
        // Foreign key violation — the request references a record that doesn't exist.
        case "P2003":
          response
            .status(400)
            .json({
              error: "Invalid reference — related record does not exist",
              code: "INVALID_REFERENCE",
            });
          return;
        // Would violate a required relation (e.g. deleting a record another required
        // relation still points to).
        case "P2014":
          response
            .status(409)
            .json({
              error: "Conflict — operation violates a required relation",
              code: "CONFLICT",
            });
          return;
      }
    }

    this.logger.error(exception instanceof Error ? exception.stack : exception);
    response
      .status(500)
      .json({ error: "Internal server error", code: "INTERNAL_ERROR" });
  }
}
