import { Injectable } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { UnauthorizedApiException } from "@/common/exceptions/api.exception";
import { ErrorCode } from "@/common/exceptions/error-codes";

@Injectable()
export class GithubAuthGuard extends AuthGuard("github") {
  // See GoogleAuthGuard — same fix, same reason: keep the { error, code }
  // response convention on a denied/failed GitHub auth instead of Nest's default.
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
