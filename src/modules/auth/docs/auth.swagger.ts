import { applyDecorators } from "@nestjs/common";
import {
  ApiBody,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from "@nestjs/swagger";
import {
  InternalServerErrorApiResponse,
  rateLimitResponse,
} from "@/core/swagger/common.responses";
import {
  ForgotPasswordRequestDto,
  LoginRequestDto,
  MessageResponseDto,
  RegisterRequestDto,
  RegisterResponseDto,
  ResetPasswordRequestDto,
  SessionResponseDto,
  TokenResponseDto,
} from "./auth.dto";
import {
  ForgotPasswordRequestExample,
  ForgotPasswordResponseExample,
  LoginRequestExample,
  RegisterRequestExample,
  RegisterResponseExample,
  ResetPasswordRequestExample,
  ResetPasswordResponseExample,
  SessionAnonymousExample,
  SessionAuthenticatedExample,
  TokenResponseExample,
} from "./auth.examples";
import {
  EmailAlreadyRegisteredResponse,
  InvalidCredentialsResponse,
  InvalidOrExpiredTokenResponse,
  ValidationErrorResponse,
} from "./auth.responses";

export const ApiAuthTag = () => applyDecorators(ApiTags("Auth"));

export const ApiRegister = () =>
  applyDecorators(
    ApiOperation({
      summary: "Register a new user",
      description:
        "Creates a TALENT or EMPLOYER account with a bcrypt-hashed password. Auto-provisions a TalentProfile (with a generated slug) for TALENT signups and sends a welcome email (no-op without RESEND_API_KEY).",
    }),
    ApiBody({
      type: RegisterRequestDto,
      examples: { default: { value: RegisterRequestExample } },
    }),
    ApiCreatedResponse({
      description: "User created",
      type: RegisterResponseDto,
      schema: { example: RegisterResponseExample },
    }),
    ValidationErrorResponse,
    EmailAlreadyRegisteredResponse,
    rateLimitResponse("5 req/60s per IP"),
    InternalServerErrorApiResponse,
  );

export const ApiLogin = () =>
  applyDecorators(
    ApiOperation({
      summary: "Log in",
      description:
        "Validates email/password credentials and issues a signed JWT access token.",
    }),
    ApiBody({
      type: LoginRequestDto,
      examples: { default: { value: LoginRequestExample } },
    }),
    ApiOkResponse({
      description: "Login succeeded",
      type: TokenResponseDto,
      schema: { example: TokenResponseExample },
    }),
    ValidationErrorResponse,
    InvalidCredentialsResponse,
    rateLimitResponse("10 req/60s per IP, 10 req/60s per email"),
    InternalServerErrorApiResponse,
  );

export const ApiSession = () =>
  applyDecorators(
    ApiOperation({
      summary: "Read the current session",
      description:
        "Reads an optional `Authorization: Bearer <jwt>` header, verifies it, and returns the decoded user. Never throws — resolves to `{ user: null }` (still 200) when the header is missing, malformed, or the token is invalid/expired.",
    }),
    ApiOkResponse({
      description: "Current user, or null if not authenticated",
      type: SessionResponseDto,
      schema: {
        examples: {
          authenticated: { value: SessionAuthenticatedExample },
          anonymous: { value: SessionAnonymousExample },
        },
      },
    }),
  );

export const ApiGoogleLogin = () =>
  applyDecorators(
    ApiOperation({
      summary: "Start Google OAuth sign-in",
      description:
        "Redirects the browser to Google's consent screen. Only registered when AUTH_GOOGLE_ID and AUTH_GOOGLE_SECRET are configured — otherwise this route doesn't exist / throws at the Passport layer (500).",
    }),
    ApiResponse({
      status: 302,
      description: "Redirects to Google's OAuth consent screen",
    }),
  );

export const ApiGoogleCallback = () =>
  applyDecorators(
    ApiOperation({
      summary: "Google OAuth callback",
      description:
        "Google's OAuth redirect target. Looks up or creates the user from the Google profile, issues a JWT, and redirects to `<FRONTEND_URL>/auth/callback?token=<accessToken>`. A profile with no email surfaces as a 500 (raw Error, not an ApiException) rather than a 401.",
    }),
    ApiResponse({
      status: 302,
      description:
        "Redirects to `<FRONTEND_URL>/auth/callback?token=<accessToken>`",
    }),
    InternalServerErrorApiResponse,
  );

export const ApiGithubLogin = () =>
  applyDecorators(
    ApiOperation({
      summary: "Start GitHub OAuth sign-in",
      description:
        "Redirects the browser to GitHub's consent screen. Only registered when AUTH_GITHUB_ID and AUTH_GITHUB_SECRET are configured.",
    }),
    ApiResponse({
      status: 302,
      description: "Redirects to GitHub's OAuth consent screen",
    }),
  );

export const ApiGithubCallback = () =>
  applyDecorators(
    ApiOperation({
      summary: "GitHub OAuth callback",
      description:
        "GitHub's OAuth redirect target; same flow as the Google callback. A profile with no public email surfaces as a 500 rather than a 401.",
    }),
    ApiResponse({
      status: 302,
      description:
        "Redirects to `<FRONTEND_URL>/auth/callback?token=<accessToken>`",
    }),
    InternalServerErrorApiResponse,
  );

export const ApiForgotPassword = () =>
  applyDecorators(
    ApiOperation({
      summary: "Request a password reset",
      description:
        "Issues a password-reset token (TTL 1h) if the email exists and emails a reset link. Always returns the same generic message to prevent user enumeration.",
    }),
    ApiBody({
      type: ForgotPasswordRequestDto,
      examples: { default: { value: ForgotPasswordRequestExample } },
    }),
    ApiOkResponse({
      description: "Request accepted",
      type: MessageResponseDto,
      schema: { example: ForgotPasswordResponseExample },
    }),
    ValidationErrorResponse,
    rateLimitResponse("3 req/60s per IP"),
    InternalServerErrorApiResponse,
  );

export const ApiResetPassword = () =>
  applyDecorators(
    ApiOperation({
      summary: "Reset password",
      description: "Consumes a password-reset token and sets a new password.",
    }),
    ApiBody({
      type: ResetPasswordRequestDto,
      examples: { default: { value: ResetPasswordRequestExample } },
    }),
    ApiOkResponse({
      description: "Password updated",
      type: MessageResponseDto,
      schema: { example: ResetPasswordResponseExample },
    }),
    ValidationErrorResponse,
    InvalidOrExpiredTokenResponse,
    rateLimitResponse("5 req/60s per IP"),
    InternalServerErrorApiResponse,
  );
