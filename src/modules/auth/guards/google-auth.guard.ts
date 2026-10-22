import { Injectable, Logger, type ExecutionContext } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { AuthGuard } from "@nestjs/passport";
import type { Request, Response } from "express";
import { UnauthorizedApiException } from "@/common/exceptions/api.exception";
import { ErrorCode } from "@/common/exceptions/error-codes";
import { applyOAuthStateCheck } from "../oauth-state.util";
import { AuthService } from "../auth.service";
import { MetricsService } from "@/modules/metrics/metrics.service";
import { assertOAuthProviderConfigured } from "../oauth-provider-config";
import type { EnvConfig } from "@/core/config/env.validation";

@Injectable()
export class GoogleAuthGuard extends AuthGuard("google") {
  private readonly logger = new Logger(GoogleAuthGuard.name);

  constructor(
    private readonly authService: AuthService,
    private readonly metricsService: MetricsService,
    private readonly config: ConfigService<EnvConfig, true>,
  ) {
    super();
  }

  override canActivate(context: ExecutionContext) {
    assertOAuthProviderConfigured(this.config, "google");
    return super.canActivate(context);
  }

  // See oauth-state.util.ts — stateless CSRF protection for this redirect
  // flow, since passport-oauth2's own state:true needs session support this
  // app doesn't have.
  override getAuthenticateOptions(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<Request>();
    const response = context.switchToHttp().getResponse<Response>();
    try {
      return applyOAuthStateCheck(
        request,
        response,
        (state) =>
          this.authService.verifyOAuthLinkIntent(state, "google") !== null,
      );
    } catch (error) {
      // The alertable signal behind "invalid OAuth state" — never the state
      // or code value itself, just that this provider's callback saw a
      // mismatch. A sustained rate here is either a login-CSRF attempt or a
      // client integration bug, both worth someone noticing.
      this.metricsService.recordAuthFailure("oauth_state_invalid:google");
      this.logger.warn("Google OAuth state validation failed");
      throw error;
    }
  }

  // Without this override, a denied/failed Google auth throws Nest's default
  // UnauthorizedException ({ statusCode, message, error }) instead of this
  // app's { error, code } convention that every other endpoint uses — same fix
  // JwtAuthGuard already applies for the bearer-token path.
  override handleRequest<TUser = unknown>(
    err: unknown,
    user: TUser | false,
  ): TUser {
    if (err || !user) {
      // Never logs `err` itself — passport-google-oauth20 can surface the
      // provider's raw token-exchange error here, which is exactly the kind
      // of "authorization code/token" detail this app must not log.
      this.metricsService.recordAuthFailure("oauth_callback_failed:google");
      this.logger.warn("Google OAuth callback failed");
      throw new UnauthorizedApiException(
        "Unauthorized",
        ErrorCode.AUTHENTICATION_REQUIRED,
      );
    }
    return user;
  }
}
