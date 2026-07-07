import { ArgumentsHost, Catch, ExceptionFilter, HttpException, Logger } from "@nestjs/common";
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
      response.status(status).json(typeof body === "object" && body !== null ? body : { error: body });
      return;
    }

    // Catches races that slip past an application-level check-then-write (e.g. two
    // concurrent "apply to job" requests) — without this, a unique-constraint hit
    // surfaces as a raw 500 instead of a normal 409.
    if (exception instanceof Prisma.PrismaClientKnownRequestError && exception.code === "P2002") {
      response.status(409).json({ error: "Conflict — this record already exists" });
      return;
    }

    this.logger.error(exception instanceof Error ? exception.stack : exception);
    response.status(500).json({ error: "Internal server error" });
  }
}
