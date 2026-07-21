import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from "@nestjs/common";
import type { Request, Response } from "express";
import type { Observable } from "rxjs";
import { tap } from "rxjs/operators";

/**
 * Surfaces X-RateLimit-Limit/-Remaining on successful responses for any route
 * whose RateLimitService.enforce() call was passed the request — until now the
 * only signal a client ever got was Retry-After, and only after it was already
 * blocked. Runs via tap() (before the response is sent), not response.on
 * ("finish") like LoggingInterceptor — headers must be set before the body is
 * written, whereas that interceptor deliberately waits until after.
 */
@Injectable()
export class RateLimitHeadersInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<Request>();
    const response = context.switchToHttp().getResponse<Response>();

    return next.handle().pipe(
      tap(() => {
        const info = request.rateLimitInfo;
        if (!info) return;
        response.setHeader("X-RateLimit-Limit", info.limit);
        response.setHeader("X-RateLimit-Remaining", info.remaining);
      }),
    );
  }
}
