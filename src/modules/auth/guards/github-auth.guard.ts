import { Injectable, type ExecutionContext } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import type { Request, Response } from "express";
import { UnauthorizedApiException } from "@/common/exceptions/api.exception";
import { ErrorCode } from "@/common/exceptions/error-codes";
import { applyOAuthStateCheck } from "../oauth-state.util";
import { AuthService } from "../auth.service";

@Injectable()
export class GithubAuthGuard extends AuthGuard("github") {
  constructor(private readonly authService: AuthService) {
    super();
  }

  // See GoogleAuthGuard / oauth-state.util.ts — same stateless CSRF check.
  override getAuthenticateOptions(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<Request>();
    const response = context.switchToHttp().getResponse<Response>();
    return applyOAuthStateCheck(
      request,
      response,
      (state) =>
        this.authService.verifyOAuthLinkIntent(state, "github") !== null,
    );
  }

  // See GoogleAuthGuard — same fix, same reason: keep the { error, code }
  // response convention on a denied/failed GitHub auth instead of Nest's default.
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
