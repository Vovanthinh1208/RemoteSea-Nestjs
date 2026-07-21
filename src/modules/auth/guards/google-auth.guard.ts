import { Injectable } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { UnauthorizedApiException } from "@/common/exceptions/api.exception";
import { ErrorCode } from "@/common/exceptions/error-codes";

@Injectable()
export class GoogleAuthGuard extends AuthGuard("google") {
  // Without this override, a denied/failed Google auth throws Nest's default
  // UnauthorizedException ({ statusCode, message, error }) instead of this
  // app's { error, code } convention that every other endpoint uses — same fix
  // JwtAuthGuard already applies for the bearer-token path.
  handleRequest<TUser = unknown>(err: unknown, user: TUser | false): TUser {
    if (err || !user) {
      throw new UnauthorizedApiException(
        "Unauthorized",
        ErrorCode.AUTHENTICATION_REQUIRED,
      );
    }
    return user;
  }
}
