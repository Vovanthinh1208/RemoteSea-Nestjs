import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Request } from "express";
import { UnauthorizedApiException } from "@/common/exceptions/api.exception";
import type { EnvConfig } from "@/core/config/env.validation";

@Injectable()
export class CronSecretGuard implements CanActivate {
  constructor(private readonly config: ConfigService<EnvConfig, true>) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const authHeader = request.headers.authorization;
    const cronSecret = this.config.get("CRON_SECRET", { infer: true });

    if (authHeader !== `Bearer ${cronSecret}`) {
      throw new UnauthorizedApiException();
    }

    return true;
  }
}
