import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from "@nestjs/common";
import type { Request, Response } from "express";
import type { Observable } from "rxjs";
import { MetricsService } from "@/modules/metrics/metrics.service";

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

  constructor(private readonly metricsService: MetricsService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<Request>();
    const response = context.switchToHttp().getResponse<Response>();
    const start = Date.now();

    response.on("finish", () => {
      const status = response.statusCode;
      // req.route.path is the matched route pattern ("/jobs/:id"), not the
      // raw URL — logging raw URLs would blow up log cardinality with one
      // series per job id instead of one per route. Same value feeds both
      // the access log line below and the /metrics counters/histogram.
      const route = request.route?.path ?? request.path;
      const durationMs = Date.now() - start;
      const line = JSON.stringify({
        requestId: request.id,
        method: request.method,
        route,
        status,
        durationMs,
      });

      // Every request logged at the same level regardless of outcome meant a
      // log aggregator couldn't alert on error rate from the access log alone
      // — it had to parse the JSON body first just to find `status`.
      if (status >= 500) this.logger.error(line);
      else if (status >= 400) this.logger.warn(line);
      else this.logger.log(line);

      this.metricsService.recordRequest(
        request.method,
        route,
        status,
        durationMs / 1000,
      );
    });

    return next.handle();
  }
}
