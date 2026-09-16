import { Injectable, type ExecutionContext } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import type { Request, Response } from "express";
import { UnauthorizedApiException } from "@/common/exceptions/api.exception";
import { ErrorCode } from "@/common/exceptions/error-codes";
import { applyOAuthStateCheck } from "../oauth-state.util";
import { AuthService } from "../auth.service";

@Injectable()
export class GoogleAuthGuard extends AuthGuard("google") {
  constructor(private readonly authService: AuthService) {
    super();
  }

  // See oauth-state.util.ts — stateless CSRF protection for this redirect
  // flow, since passport-oauth2's own state:true needs session support this
  // app doesn't have.
  override getAuthenticateOptions(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<Request>();
    const response = context.switchToHttp().getResponse<Response>();
    return applyOAuthStateCheck(
      request,
      response,
      (state) =>
        this.authService.verifyOAuthLinkIntent(state, "google") !== null,
    );
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
      throw new UnauthorizedApiException(
        "Unauthorized",
        ErrorCode.AUTHENTICATION_REQUIRED,
      );
    }
    return user;
  }
}
