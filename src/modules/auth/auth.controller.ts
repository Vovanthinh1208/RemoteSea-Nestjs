import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Req,
  Res,
  UseGuards,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Request, Response } from "express";
import { AuthService } from "./auth.service";
import { GoogleAuthGuard } from "./guards/google-auth.guard";
import { GithubAuthGuard } from "./guards/github-auth.guard";
import { LinkedinAuthGuard } from "./guards/linkedin-auth.guard";
import {
  linkProviderParamSchema,
  type LinkProviderParamDto,
} from "./dto/link-provider-param.dto";
import { registerSchema, type RegisterDto } from "./dto/register.dto";
import { loginSchema, type LoginDto } from "./dto/login.dto";
import {
  oauthExchangeSchema,
  type OAuthExchangeDto,
} from "./dto/oauth-exchange.dto";
import {
  forgotPasswordSchema,
  type ForgotPasswordDto,
} from "./dto/forgot-password.dto";
import {
  resetPasswordSchema,
  type ResetPasswordDto,
} from "./dto/reset-password.dto";
import {
  disableTwoFactorSchema,
  type DisableTwoFactorDto,
  twoFactorChallengeSchema,
  type TwoFactorChallengeDto,
  verifyTwoFactorSetupSchema,
  type VerifyTwoFactorSetupDto,
} from "./dto/two-factor.dto";
import { RATE_LIMITS } from "./constants";
import { ZodValidationPipe } from "@/core/pipes/zod-validation.pipe";
import { JwtAuthGuard } from "@/core/guards/jwt-auth.guard";
import { CurrentUser } from "@/core/decorators/current-user.decorator";
import {
  RateLimitService,
  clientIp,
} from "@/common/services/rate-limit.service";
import type { EnvConfig } from "@/core/config/env.validation";
import type { AuthenticatedUser } from "@/common/interfaces/authenticated-user.interface";
import { ConflictApiException } from "@/common/exceptions/api.exception";
import type { OAuthProfile, OAuthProviderName } from "./interfaces";
import {
  ApiAuthTag,
  ApiDisableTwoFactor,
  ApiForgotPassword,
  ApiGithubCallback,
  ApiGithubLogin,
  ApiGoogleCallback,
  ApiGoogleLogin,
  ApiLinkProvider,
  ApiLinkedinCallback,
  ApiLinkedinLogin,
  ApiLogin,
  ApiMe,
  ApiOAuthExchange,
  ApiRegister,
  ApiResetPassword,
  ApiSession,
  ApiSetupTwoFactor,
  ApiTwoFactorChallenge,
  ApiTwoFactorStatus,
  ApiVerifyTwoFactorSetup,
} from "./docs/auth.swagger";

// Captured at issueToken time so Settings > Security > Active sessions can
// show a friendly device label + IP for each login — see AuthService.issueToken.
const sessionMeta = (req: Request): { userAgent?: string; ip?: string } => ({
  userAgent: req.headers["user-agent"],
  ip: clientIp(req),
});

@ApiAuthTag()
@Controller("auth")
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly rateLimitService: RateLimitService,
    private readonly config: ConfigService<EnvConfig, true>,
  ) {}

  @ApiRegister()
  @Post("register")
  @HttpCode(HttpStatus.CREATED)
  async register(
    @Req() req: Request,
    @Body(new ZodValidationPipe(registerSchema)) body: RegisterDto,
  ) {
    this.rateLimitService.enforce(
      `register:${clientIp(req)}`,
      RATE_LIMITS.REGISTER.limit,
      RATE_LIMITS.REGISTER.windowMs,
      req,
    );
    return this.authService.register(body, sessionMeta(req));
  }

  @ApiLogin()
  @Post("login")
  @HttpCode(HttpStatus.OK)
  async login(
    @Req() req: Request,
    @Body(new ZodValidationPipe(loginSchema)) body: LoginDto,
  ) {
    this.rateLimitService.enforce(
      `login-ip:${clientIp(req)}`,
      RATE_LIMITS.LOGIN.limit,
      RATE_LIMITS.LOGIN.windowMs,
      req,
    );
    // body.email is already normalized by loginSchema (emailSchema), so this and the
    // actual auth lookup in validateCredentials are guaranteed to agree on identity.
    this.rateLimitService.enforce(
      `login-email:${body.email}`,
      RATE_LIMITS.LOGIN.limit,
      RATE_LIMITS.LOGIN.windowMs,
      req,
    );

    // Returns { accessToken, user } directly, or — if this account has 2FA
    // enabled — { twoFactorRequired: true, challengeToken } instead, which
    // the frontend must exchange via POST /auth/2fa/challenge.
    return this.authService.loginOrChallenge(
      body.email,
      body.password,
      sessionMeta(req),
    );
  }

  @ApiTwoFactorChallenge()
  @Post("2fa/challenge")
  @HttpCode(HttpStatus.OK)
  async twoFactorChallenge(
    @Req() req: Request,
    @Body(new ZodValidationPipe(twoFactorChallengeSchema))
    body: TwoFactorChallengeDto,
  ) {
    this.rateLimitService.enforce(
      `2fa-challenge:${clientIp(req)}`,
      RATE_LIMITS.TWO_FACTOR_CHALLENGE.limit,
      RATE_LIMITS.TWO_FACTOR_CHALLENGE.windowMs,
      req,
    );
    // Same limit, keyed by the target account (decoded from the challenge
    // token itself) instead of the caller's IP — closes the gap where a TOTP
    // brute force spread across many source IPs would never trip the per-IP
    // limiter above. No-op for a token that doesn't decode to a real
    // challenge — completeTwoFactorChallenge below rejects that on its own,
    // and the per-IP limiter still applies to it either way.
    const challengeAccountId = this.authService.decodeTwoFactorChallengeSubject(
      body.challengeToken,
    );
    if (challengeAccountId) {
      this.rateLimitService.enforce(
        `2fa-challenge-account:${challengeAccountId}`,
        RATE_LIMITS.TWO_FACTOR_CHALLENGE.limit,
        RATE_LIMITS.TWO_FACTOR_CHALLENGE.windowMs,
        req,
      );
    }
    return this.authService.completeTwoFactorChallenge(
      body.challengeToken,
      body.code,
      sessionMeta(req),
    );
  }

  @ApiTwoFactorStatus()
  @Get("2fa/status")
  @UseGuards(JwtAuthGuard)
  async twoFactorStatus(@CurrentUser() user: AuthenticatedUser) {
    return this.authService.getTwoFactorStatus(user.id);
  }

  @ApiSetupTwoFactor()
  @Post("2fa/setup")
  @UseGuards(JwtAuthGuard)
  async setupTwoFactor(@CurrentUser() user: AuthenticatedUser) {
    return this.authService.setupTwoFactor(user.id, user.email);
  }

  @ApiVerifyTwoFactorSetup()
  @Post("2fa/verify")
  @UseGuards(JwtAuthGuard)
  async verifyTwoFactorSetup(
    @Req() req: Request,
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(verifyTwoFactorSetupSchema))
    body: VerifyTwoFactorSetupDto,
  ) {
    this.rateLimitService.enforce(
      `2fa-verify:${user.id}`,
      RATE_LIMITS.TWO_FACTOR_VERIFY.limit,
      RATE_LIMITS.TWO_FACTOR_VERIFY.windowMs,
      req,
    );
    return this.authService.verifyTwoFactorSetup(user.id, body.token);
  }

  @ApiDisableTwoFactor()
  @Post("2fa/disable")
  @UseGuards(JwtAuthGuard)
  async disableTwoFactor(
    @Req() req: Request,
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(disableTwoFactorSchema))
    body: DisableTwoFactorDto,
  ) {
    this.rateLimitService.enforce(
      `2fa-disable:${user.id}`,
      RATE_LIMITS.TWO_FACTOR_DISABLE.limit,
      RATE_LIMITS.TWO_FACTOR_DISABLE.windowMs,
      req,
    );
    await this.authService.disableTwoFactor(user.id, body.password);
    return { message: "Two-factor authentication disabled" };
  }

  @ApiSession()
  @Get("session")
  async session(
    @Req() req: Request,
  ): Promise<{ user: AuthenticatedUser | null }> {
    return {
      user: await this.authService.verifySession(req.headers.authorization),
    };
  }

  @ApiMe()
  @Get("me")
  @UseGuards(JwtAuthGuard)
  async me(@CurrentUser() user: AuthenticatedUser) {
    return this.authService.getSessionProfile(user.id);
  }

  // Settings > Connected accounts "Connect". Unlike the plain sign-in routes
  // below, this can't be a Passport-guard-driven redirect: the browser's
  // top-level navigation to the provider's consent screen can't carry an
  // Authorization header, so there'd be nothing for JwtAuthGuard to check.
  // Instead this is a normal authenticated JSON endpoint (frontend calls it
  // via XHR, then does `window.location.href = url` itself) that hands back
  // a fully-formed authorization URL with a link-intent token embedded as
  // the OAuth `state` param — the shared callback below picks it back up
  // once the provider redirects to it.
  @ApiLinkProvider()
  @Get(":provider/link")
  @UseGuards(JwtAuthGuard)
  linkProvider(
    @CurrentUser() user: AuthenticatedUser,
    @Param("provider", new ZodValidationPipe(linkProviderParamSchema))
    provider: LinkProviderParamDto,
  ): { url: string } {
    const state = this.authService.createOAuthLinkIntent(user.id, provider);
    return { url: this.buildAuthorizationUrl(provider, state) };
  }

  private buildAuthorizationUrl(
    provider: LinkProviderParamDto,
    state: string,
  ): string {
    const cfg = this.config;
    if (provider === "google") {
      const params = new URLSearchParams({
        client_id: cfg.get("AUTH_GOOGLE_ID", { infer: true }) ?? "",
        redirect_uri:
          cfg.get("AUTH_GOOGLE_CALLBACK_URL", { infer: true }) ?? "",
        response_type: "code",
        scope: "email profile",
        state,
      });
      return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
    }
    if (provider === "github") {
      const params = new URLSearchParams({
        client_id: cfg.get("AUTH_GITHUB_ID", { infer: true }) ?? "",
        redirect_uri:
          cfg.get("AUTH_GITHUB_CALLBACK_URL", { infer: true }) ?? "",
        scope: "user:email",
        state,
      });
      return `https://github.com/login/oauth/authorize?${params.toString()}`;
    }
    const params = new URLSearchParams({
      client_id: cfg.get("AUTH_LINKEDIN_ID", { infer: true }) ?? "",
      redirect_uri:
        cfg.get("AUTH_LINKEDIN_CALLBACK_URL", { infer: true }) ?? "",
      response_type: "code",
      scope: "openid profile email",
      state,
    });
    return `https://www.linkedin.com/oauth/v2/authorization?${params.toString()}`;
  }

  @ApiGoogleLogin()
  @Get("google")
  @UseGuards(GoogleAuthGuard)
  googleLogin(): void {
    // Passport redirects to Google's consent screen; handled by GoogleAuthGuard.
  }

  @ApiGoogleCallback()
  @Get("google/callback")
  @UseGuards(GoogleAuthGuard)
  async googleCallback(
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    await this.handleOAuthCallback("google", req, res);
  }

  @ApiGithubLogin()
  @Get("github")
  @UseGuards(GithubAuthGuard)
  githubLogin(): void {
    // Passport redirects to GitHub's consent screen; handled by GithubAuthGuard.
  }

  @ApiGithubCallback()
  @Get("github/callback")
  @UseGuards(GithubAuthGuard)
  async githubCallback(
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    await this.handleOAuthCallback("github", req, res);
  }

  // Only registered when AUTH_LINKEDIN_ID/SECRET are configured (see
  // AuthModule) — hitting these routes with no LinkedIn app configured throws
  // at the Passport layer, same as the Google/GitHub routes do.
  @ApiLinkedinLogin()
  @Get("linkedin")
  @UseGuards(LinkedinAuthGuard)
  linkedinLogin(): void {
    // Passport redirects to LinkedIn's consent screen; handled by LinkedinAuthGuard.
  }

  @ApiLinkedinCallback()
  @Get("linkedin/callback")
  @UseGuards(LinkedinAuthGuard)
  async linkedinCallback(
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    await this.handleOAuthCallback("linkedin", req, res);
  }

  // Shared by all three providers' callback routes. A present-and-valid
  // link-intent `state` (minted by GET /auth/:provider/link) means "link this
  // profile to an existing, already-authenticated account" — otherwise this
  // is an ordinary sign-in attempt (find-or-create-by-email + issue a token).
  private async handleOAuthCallback(
    provider: OAuthProviderName,
    req: Request,
    res: Response,
  ): Promise<void> {
    const frontendUrl = this.config.get("FRONTEND_URL", { infer: true });
    const linkIntent = this.authService.verifyOAuthLinkIntent(
      req.query.state as string | undefined,
      provider,
    );

    if (linkIntent) {
      try {
        await this.authService.linkOAuthAccount(
          linkIntent.sub,
          req.user as OAuthProfile,
        );
        res.redirect(`${frontendUrl}/settings?connected=${provider}`);
      } catch (err) {
        const reason =
          err instanceof ConflictApiException ? "already_linked" : "unknown";
        res.redirect(
          `${frontendUrl}/settings?connectionError=${provider}&reason=${reason}`,
        );
      }
      return;
    }

    const user = await this.authService.validateOAuthLogin(
      req.user as OAuthProfile,
    );
    // A real access token doesn't go in this URL — it would sit in browser
    // history and get sent in the Referer header of any subsequent cross-
    // origin navigation from the callback page. This short-lived, single-
    // purpose code is exchanged for the real token via POST
    // /auth/oauth/exchange, which the frontend calls immediately on landing.
    const code = this.authService.createOAuthExchangeCode(user.id);
    res.redirect(`${frontendUrl}/auth/callback?code=${code}`);
  }

  @ApiOAuthExchange()
  @Post("oauth/exchange")
  @HttpCode(HttpStatus.OK)
  async oauthExchange(
    @Req() req: Request,
    @Body(new ZodValidationPipe(oauthExchangeSchema)) body: OAuthExchangeDto,
  ) {
    this.rateLimitService.enforce(
      `oauth-exchange:${clientIp(req)}`,
      RATE_LIMITS.OAUTH_EXCHANGE.limit,
      RATE_LIMITS.OAUTH_EXCHANGE.windowMs,
      req,
    );
    return this.authService.completeOAuthExchange(body.code, sessionMeta(req));
  }

  @ApiForgotPassword()
  @Post("forgot-password")
  @HttpCode(HttpStatus.OK)
  async forgotPassword(
    @Req() req: Request,
    @Body(new ZodValidationPipe(forgotPasswordSchema)) body: ForgotPasswordDto,
  ) {
    this.rateLimitService.enforce(
      `forgot:${clientIp(req)}`,
      RATE_LIMITS.FORGOT_PASSWORD.limit,
      RATE_LIMITS.FORGOT_PASSWORD.windowMs,
      req,
    );
    // Keyed on the submitted address, known or not, so the 429 itself never
    // reveals whether an account exists.
    this.rateLimitService.enforce(
      `forgot-email:${body.email.trim().toLowerCase()}`,
      RATE_LIMITS.FORGOT_PASSWORD_EMAIL.limit,
      RATE_LIMITS.FORGOT_PASSWORD_EMAIL.windowMs,
      req,
    );
    await this.authService.forgotPassword(body.email);
    return { message: "If that email exists, a reset link was sent." };
  }

  @ApiResetPassword()
  @Post("reset-password")
  @HttpCode(HttpStatus.OK)
  async resetPassword(
    @Req() req: Request,
    @Body(new ZodValidationPipe(resetPasswordSchema)) body: ResetPasswordDto,
  ) {
    this.rateLimitService.enforce(
      `reset:${clientIp(req)}`,
      RATE_LIMITS.RESET_PASSWORD.limit,
      RATE_LIMITS.RESET_PASSWORD.windowMs,
      req,
    );
    await this.authService.resetPassword(body.token, body.password);
    return { message: "Password updated" };
  }
}
