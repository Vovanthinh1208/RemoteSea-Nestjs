import { Injectable, Logger, type ExecutionContext } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import type { Request, Response } from "express";
import { UnauthorizedApiException } from "@/common/exceptions/api.exception";
import { ErrorCode } from "@/common/exceptions/error-codes";
import { applyOAuthStateCheck } from "../oauth-state.util";
import { AuthService } from "../auth.service";
import { MetricsService } from "@/modules/metrics/metrics.service";

@Injectable()
export class GithubAuthGuard extends AuthGuard("github") {
  private readonly logger = new Logger(GithubAuthGuard.name);

  constructor(
    private readonly authService: AuthService,
    private readonly metricsService: MetricsService,
  ) {
    super();
  }

  // See GoogleAuthGuard / oauth-state.util.ts — same stateless CSRF check.
  override getAuthenticateOptions(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<Request>();
    const response = context.switchToHttp().getResponse<Response>();
    try {
      return applyOAuthStateCheck(
        request,
        response,
        (state) =>
          this.authService.verifyOAuthLinkIntent(state, "github") !== null,
      );
    } catch (error) {
      // See GoogleAuthGuard — same alertable signal, same reason.
      this.metricsService.recordAuthFailure("oauth_state_invalid:github");
      this.logger.warn("GitHub OAuth state validation failed");
      throw error;
    }
  }

  // See GoogleAuthGuard — same fix, same reason: keep the { error, code }
  // response convention on a denied/failed GitHub auth instead of Nest's default.
  override handleRequest<TUser = unknown>(
    err: unknown,
    user: TUser | false,
  ): TUser {
    if (err || !user) {
      // Never logs `err` itself — see GoogleAuthGuard's own comment.
      this.metricsService.recordAuthFailure("oauth_callback_failed:github");
      this.logger.warn("GitHub OAuth callback failed");
      throw new UnauthorizedApiException(
        "Unauthorized",
        ErrorCode.AUTHENTICATION_REQUIRED,
      );
    }
    return user;
  }
}
