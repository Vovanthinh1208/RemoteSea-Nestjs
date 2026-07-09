import { HttpException, HttpStatus } from "@nestjs/common";

/**
 * Base for every exception thrown by application code. Response body is
 * `{ error: <payload>, code: <stable machine-readable string> }` — `error`
 * stays byte-identical with the original Next.js route handlers
 * (`NextResponse.json({ error }, { status })`), and `code` is additive: a
 * future localized frontend can switch on `code` instead of string-matching
 * the (currently English-only) `error` message, which previously had no
 * stable identifier at all.
 * Never throw Nest's built-in HttpException subclasses directly — their
 * default body shape (`{ statusCode, message, error }`) does not match.
 */
export class ApiException extends HttpException {
  constructor(
    status: HttpStatus,
    error: string | Record<string, unknown>,
    code: string,
  ) {
    super({ error, code }, status);
  }
}

export class UnauthorizedApiException extends ApiException {
  constructor(message = "Unauthorized") {
    super(HttpStatus.UNAUTHORIZED, message, "UNAUTHORIZED");
  }
}

export class ForbiddenApiException extends ApiException {
  constructor(message = "Forbidden") {
    super(HttpStatus.FORBIDDEN, message, "FORBIDDEN");
  }
}

export class NotFoundApiException extends ApiException {
  constructor(message = "Not found") {
    super(HttpStatus.NOT_FOUND, message, "NOT_FOUND");
  }
}

export class ConflictApiException extends ApiException {
  constructor(message: string) {
    super(HttpStatus.CONFLICT, message, "CONFLICT");
  }
}

export class BadRequestApiException extends ApiException {
  constructor(message: string | Record<string, unknown>, code = "BAD_REQUEST") {
    super(HttpStatus.BAD_REQUEST, message, code);
  }
}

export class ValidationApiException extends ApiException {
  constructor(flattened: Record<string, unknown>) {
    super(HttpStatus.BAD_REQUEST, flattened, "VALIDATION_ERROR");
  }
}

export class TooManyRequestsApiException extends ApiException {
  constructor(public readonly retryAfter: number) {
    super(
      HttpStatus.TOO_MANY_REQUESTS,
      "Too many requests. Please slow down and try again shortly.",
      "RATE_LIMITED",
    );
  }
}
