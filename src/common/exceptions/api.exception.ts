import { HttpException, HttpStatus } from "@nestjs/common";

/**
 * Base for every exception thrown by application code. Response body is
 * always `{ error: <payload> }` to stay byte-identical with the original
 * Next.js route handlers (`NextResponse.json({ error }, { status })`).
 * Never throw Nest's built-in HttpException subclasses directly — their
 * default body shape (`{ statusCode, message, error }`) does not match.
 */
export class ApiException extends HttpException {
  constructor(status: HttpStatus, error: string | Record<string, unknown>) {
    super({ error }, status);
  }
}

export class UnauthorizedApiException extends ApiException {
  constructor(message = "Unauthorized") {
    super(HttpStatus.UNAUTHORIZED, message);
  }
}

export class ForbiddenApiException extends ApiException {
  constructor(message = "Forbidden") {
    super(HttpStatus.FORBIDDEN, message);
  }
}

export class NotFoundApiException extends ApiException {
  constructor(message = "Not found") {
    super(HttpStatus.NOT_FOUND, message);
  }
}

export class ConflictApiException extends ApiException {
  constructor(message: string) {
    super(HttpStatus.CONFLICT, message);
  }
}

export class BadRequestApiException extends ApiException {
  constructor(message: string | Record<string, unknown>) {
    super(HttpStatus.BAD_REQUEST, message);
  }
}

export class ValidationApiException extends ApiException {
  constructor(flattened: Record<string, unknown>) {
    super(HttpStatus.BAD_REQUEST, flattened);
  }
}

export class TooManyRequestsApiException extends ApiException {
  constructor(public readonly retryAfter: number) {
    super(HttpStatus.TOO_MANY_REQUESTS, "Too many requests. Please slow down and try again shortly.");
  }
}
