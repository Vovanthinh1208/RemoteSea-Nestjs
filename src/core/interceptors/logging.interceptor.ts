import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from "@nestjs/common";
import type { Request, Response } from "express";
import type { Observable } from "rxjs";

/**
 * One JSON line per request, logged from the response's `finish` event rather
 * than the interceptor's rxjs pipeline — `finish` fires after the exception
 * filter (if any) has already written the final status code, so this reports
 * the real status for both success and error responses. Doing it from the
 * pipeline's tap/catchError instead would log the pre-exception-filter status
 * (still 200) on the error path.
 */
@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger("HTTP");

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<Request>();
    const response = context.switchToHttp().getResponse<Response>();
    const start = Date.now();

    response.on("finish", () => {
      this.logger.log(
        JSON.stringify({
          requestId: request.id,
          method: request.method,
          // req.route.path is the matched route pattern ("/jobs/:id"), not the
          // raw URL — logging raw URLs would blow up log cardinality with one
          // series per job id instead of one per route.
          route: request.route?.path ?? request.path,
          status: response.statusCode,
          durationMs: Date.now() - start,
        }),
      );
    });

    return next.handle();
  }
}
