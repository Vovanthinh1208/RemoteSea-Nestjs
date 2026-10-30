import { HttpException, HttpStatus, Injectable } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { UnauthorizedApiException } from "@/common/exceptions/api.exception";
import { ErrorCode } from "@/common/exceptions/error-codes";

@Injectable()
export class JwtAuthGuard extends AuthGuard("jwt") {
  override handleRequest<TUser = unknown>(
    err: unknown,
    user: TUser | false,
  ): TUser {
    // An HTTP error that isn't about credentials (e.g. the 503 JwtStrategy
    // raises when the session table can't be read) keeps its own status —
    // turning it into a 401 signs the user out over an outage.
    if (
      err instanceof HttpException &&
      err.getStatus() !== HttpStatus.UNAUTHORIZED
    ) {
      throw err;
    }
    if (err || !user) {
      throw new UnauthorizedApiException(
        "Unauthorized",
        ErrorCode.AUTHENTICATION_REQUIRED,
      );
    }
    return user;
  }
}
