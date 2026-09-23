import { applyDecorators } from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiBody,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from "@nestjs/swagger";
import {
  InternalServerErrorApiResponse,
  UnauthorizedApiResponse,
  rateLimitResponse,
} from "@/core/swagger/common.responses";
import {
  AuthTokenResponseDto,
  DisableTwoFactorRequestDto,
  ForgotPasswordRequestDto,
  LoginRequestDto,
  MessageResponseDto,
  OAuthExchangeRequestDto,
  OAuthLinkUrlResponseDto,
  RegisterRequestDto,
  ResetPasswordRequestDto,
  SessionResponseDto,
  TwoFactorChallengeRequestDto,
  TwoFactorMessageResponseDto,
  TwoFactorSetupResponseDto,
  TwoFactorStatusResponseDto,
  VerifyTwoFactorSetupRequestDto,
  VerifyTwoFactorSetupResponseDto,
} from "./auth.dto";
import {
  AuthTokenResponseExample,
  DisableTwoFactorRequestExample,
  DisableTwoFactorResponseExample,
  ForgotPasswordRequestExample,
  ForgotPasswordResponseExample,
  LoginRequestExample,
  OAuthExchangeRequestExample,
  OAuthLinkUrlExample,
  RegisterRequestExample,
  ResetPasswordRequestExample,
  ResetPasswordResponseExample,
  SessionAnonymousExample,
  SessionAuthenticatedExample,
  TwoFactorChallengeRequestExample,
  TwoFactorRequiredExample,
  TwoFactorSetupExample,
  TwoFactorStatusDisabledExample,
  TwoFactorStatusEnabledExample,
  VerifyTwoFactorSetupRequestExample,
  VerifyTwoFactorSetupResponseExample,
} from "./auth.examples";
import {
  EmailAlreadyRegisteredResponse,
  IncorrectPasswordResponse,
  InvalidChallengeTokenResponse,
  InvalidCredentialsResponse,
  InvalidOAuthExchangeCodeResponse,
  InvalidOrExpiredTokenResponse,
  InvalidTwoFactorCodeResponse,
  TwoFactorSetupRequiredResponse,
  ValidationErrorResponse,
} from "./auth.responses";

export const ApiAuthTag = () => applyDecorators(ApiTags("Auth"));

export const ApiRegister = () =>
  applyDecorators(
    ApiOperation({
      summary: "Register a new user",
      description:
        "Creates a TALENT or EMPLOYER account with a bcrypt-hashed password, auto-provisions a TalentProfile (with a generated slug) for TALENT signups, sends a welcome email (no-op without RESEND_API_KEY), and immediately issues a real access token — the account is signed in on creation, no follow-up POST /auth/login required.",
    }),
    ApiBody({
      type: RegisterRequestDto,
      examples: { default: { value: RegisterRequestExample } },
    }),
    ApiCreatedResponse({
      description: "User created and signed in",
      type: AuthTokenResponseDto,
      schema: { example: AuthTokenResponseExample },
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
        "Validates email/password credentials. Issues a signed JWT directly — unless the account has two-factor authentication enabled, in which case it issues a short-lived challenge token instead (see POST /auth/2fa/challenge). Every real access token is backed by a new Session row (device/IP captured from the request).",
    }),
    ApiBody({
      type: LoginRequestDto,
      examples: { default: { value: LoginRequestExample } },
    }),
    ApiOkResponse({
      description:
        "Login succeeded (AuthTokenResponseDto), or 2FA is required to complete it (TwoFactorRequiredResponseDto) — see the two examples below",
      schema: {
        examples: {
          success: { value: AuthTokenResponseExample },
          twoFactorRequired: { value: TwoFactorRequiredExample },
        },
      },
    }),
    ValidationErrorResponse,
    InvalidCredentialsResponse,
    rateLimitResponse("10 req/60s per IP, 10 req/60s per email"),
    InternalServerErrorApiResponse,
  );

export const ApiTwoFactorChallenge = () =>
  applyDecorators(
    ApiOperation({
      summary: "Complete a 2FA login challenge",
      description:
        "Exchanges a challengeToken from POST /auth/login plus a 6-digit authenticator code (or an unused backup code) for a real access token. This is the only route that ever accepts a challenge token — JwtStrategy explicitly rejects one everywhere else.",
    }),
    ApiBody({
      type: TwoFactorChallengeRequestDto,
      examples: { default: { value: TwoFactorChallengeRequestExample } },
    }),
    ApiOkResponse({
      description: "2FA verified — real access token issued",
      type: AuthTokenResponseDto,
      schema: { example: AuthTokenResponseExample },
    }),
    ValidationErrorResponse,
    InvalidTwoFactorCodeResponse,
    InvalidChallengeTokenResponse,
    rateLimitResponse("10 req/5min per IP, 10 req/5min per target account"),
    InternalServerErrorApiResponse,
  );

export const ApiOAuthExchange = () =>
  applyDecorators(
    ApiOperation({
      summary: "Exchange an OAuth callback code for a real access token",
      description:
        "The only route that ever accepts the short-lived (60s) `code` from a Google/GitHub/LinkedIn sign-in redirect (`GET /auth/:provider/callback` → `<FRONTEND_URL>/auth/callback?code=...`) — called by the frontend's callback page immediately on landing. Kept out of the redirect URL itself so a real bearer token never sits in browser history or a Referer header.",
    }),
    ApiBody({
      type: OAuthExchangeRequestDto,
      examples: { default: { value: OAuthExchangeRequestExample } },
    }),
    ApiOkResponse({
      description: "Code verified — real access token issued",
      type: AuthTokenResponseDto,
      schema: { example: AuthTokenResponseExample },
    }),
    ValidationErrorResponse,
    InvalidOAuthExchangeCodeResponse,
    rateLimitResponse("20 req/60s per IP"),
    InternalServerErrorApiResponse,
  );

export const ApiTwoFactorStatus = () =>
  applyDecorators(
    ApiBearerAuth("bearer"),
    ApiOperation({
      summary: "Get 2FA status",
      description:
        "Whether the authenticated account currently has 2FA enabled.",
    }),
    ApiOkResponse({
      type: TwoFactorStatusResponseDto,
      schema: {
        examples: {
          disabled: { value: TwoFactorStatusDisabledExample },
          enabled: { value: TwoFactorStatusEnabledExample },
        },
      },
    }),
    UnauthorizedApiResponse,
    InternalServerErrorApiResponse,
  );

export const ApiSetupTwoFactor = () =>
  applyDecorators(
    ApiBearerAuth("bearer"),
    ApiOperation({
      summary: "Start 2FA setup",
      description:
        "Generates a new TOTP secret and stores it (unconfirmed — twoFactorEnabled stays false until POST /auth/2fa/verify succeeds). Calling this again before verifying just overwrites the pending secret.",
    }),
    ApiOkResponse({
      type: TwoFactorSetupResponseDto,
      schema: { example: TwoFactorSetupExample },
    }),
    UnauthorizedApiResponse,
    InternalServerErrorApiResponse,
  );

export const ApiVerifyTwoFactorSetup = () =>
  applyDecorators(
    ApiBearerAuth("bearer"),
    ApiOperation({
      summary: "Confirm 2FA setup",
      description:
        "Confirms the code from the authenticator app matches the secret from POST /auth/2fa/setup, then enables 2FA and generates 8 single-use backup codes.",
    }),
    ApiBody({
      type: VerifyTwoFactorSetupRequestDto,
      examples: { default: { value: VerifyTwoFactorSetupRequestExample } },
    }),
    ApiOkResponse({
      description: "2FA enabled — backup codes returned once, in plaintext",
      type: VerifyTwoFactorSetupResponseDto,
      schema: { example: VerifyTwoFactorSetupResponseExample },
    }),
    ValidationErrorResponse,
    TwoFactorSetupRequiredResponse,
    InvalidTwoFactorCodeResponse,
    UnauthorizedApiResponse,
    rateLimitResponse("10 req/5min per user"),
    InternalServerErrorApiResponse,
  );

export const ApiDisableTwoFactor = () =>
  applyDecorators(
    ApiBearerAuth("bearer"),
    ApiOperation({
      summary: "Disable 2FA",
      description:
        "Disables 2FA after verifying the account password, clearing the secret and all backup codes.",
    }),
    ApiBody({
      type: DisableTwoFactorRequestDto,
      examples: { default: { value: DisableTwoFactorRequestExample } },
    }),
    ApiOkResponse({
      type: TwoFactorMessageResponseDto,
      schema: { example: DisableTwoFactorResponseExample },
    }),
    ValidationErrorResponse,
    IncorrectPasswordResponse,
    UnauthorizedApiResponse,
    rateLimitResponse("5 req/5min per user"),
    InternalServerErrorApiResponse,
  );

export const ApiLinkProvider = () =>
  applyDecorators(
    ApiBearerAuth("bearer"),
    ApiOperation({
      summary: "Get a Connect URL for an OAuth provider",
      description:
        "Settings > Connected accounts \"Connect\". Returns a plain JSON URL rather than redirecting: a browser's top-level navigation can't carry an Authorization header, so this must be called as an authenticated XHR first, with the frontend doing window.location.href = url itself afterward. The URL embeds a short-lived (10m) link-intent token as the OAuth state param so the shared callback links the resulting profile to this caller's account instead of running the usual find-or-create-by-email login.",
    }),
    ApiParam({ name: "provider", enum: ["google", "github", "linkedin"] }),
    ApiOkResponse({
      type: OAuthLinkUrlResponseDto,
      schema: { example: OAuthLinkUrlExample },
    }),
    ValidationErrorResponse,
    UnauthorizedApiResponse,
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
        "Google's OAuth redirect target. Looks up or creates the user from the Google profile, mints a short-lived exchange code, and redirects to `<FRONTEND_URL>/auth/callback?code=<exchangeCode>` — the frontend then calls POST /auth/oauth/exchange to trade it for a real access token. A profile with no email surfaces as a 500 (raw Error, not an ApiException) rather than a 401.",
    }),
    ApiResponse({
      status: 302,
      description:
        "Redirects to `<FRONTEND_URL>/auth/callback?code=<exchangeCode>`",
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
        "Redirects to `<FRONTEND_URL>/auth/callback?code=<exchangeCode>`",
    }),
    InternalServerErrorApiResponse,
  );

export const ApiLinkedinLogin = () =>
  applyDecorators(
    ApiOperation({
      summary: "Start LinkedIn OAuth sign-in",
      description:
        "Redirects the browser to LinkedIn's consent screen. Uses \"Sign In with LinkedIn using OpenID Connect\" (scope: openid profile email), not LinkedIn's older v1/v2 REST profile API. Only registered when AUTH_LINKEDIN_ID and AUTH_LINKEDIN_SECRET are configured.",
    }),
    ApiResponse({
      status: 302,
      description: "Redirects to LinkedIn's OAuth consent screen",
    }),
  );

export const ApiLinkedinCallback = () =>
  applyDecorators(
    ApiOperation({
      summary: "LinkedIn OAuth callback",
      description:
        "LinkedIn's OAuth redirect target; same flow as the Google/GitHub callbacks (profile fetched from https://api.linkedin.com/v2/userinfo). A profile with no verified email surfaces as a 500 rather than a 401.",
    }),
    ApiResponse({
      status: 302,
      description:
        "Redirects to `<FRONTEND_URL>/auth/callback?code=<exchangeCode>`",
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
