import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Request } from "express";
import { UnauthorizedApiException } from "@/common/exceptions/api.exception";
import type { EnvConfig } from "@/core/config/env.validation";

// Same pattern as CronSecretGuard — fails closed (unset secret always
// 401s) rather than defaulting an ops-only, potentially sensitive endpoint
// (request-rate/latency data by route) to open.
@Injectable()
export class MetricsSecretGuard implements CanActivate {
  constructor(private readonly config: ConfigService<EnvConfig, true>) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const authHeader = request.headers.authorization;
    const metricsSecret = this.config.get("METRICS_SECRET", { infer: true });

    if (!metricsSecret || authHeader !== `Bearer ${metricsSecret}`) {
      throw new UnauthorizedApiException();
    }

    return true;
  }
}
