import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Request } from "express";
import { UnauthorizedApiException } from "@/common/exceptions/api.exception";
import type { EnvConfig } from "@/core/config/env.validation";
import { timingSafeEqualString } from "@/common/utils/timing-safe-equal.util";

@Injectable()
export class CronSecretGuard implements CanActivate {
  constructor(private readonly config: ConfigService<EnvConfig, true>) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const authHeader = request.headers.authorization;
    const cronSecret = this.config.get("CRON_SECRET", { infer: true });

    // timingSafeEqualString, not `!==` — see MetricsSecretGuard's own
    // comment; same class of secret-comparison timing side-channel.
    if (
      !cronSecret ||
      typeof authHeader !== "string" ||
      !timingSafeEqualString(authHeader, `Bearer ${cronSecret}`)
    ) {
      throw new UnauthorizedApiException();
    }

    return true;
  }
}
