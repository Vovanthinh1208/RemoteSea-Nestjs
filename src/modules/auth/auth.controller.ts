import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
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
import { registerSchema, type RegisterDto } from "./dto/register.dto";
import { loginSchema, type LoginDto } from "./dto/login.dto";
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
import type { OAuthProfile } from "./interfaces";
import {
  ApiAuthTag,
  ApiForgotPassword,
  ApiGithubCallback,
  ApiGithubLogin,
  ApiGoogleCallback,
  ApiGoogleLogin,
  ApiLogin,
  ApiRegister,
  ApiResetPassword,
  ApiSession,
} from "./docs/auth.swagger";

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
    return this.authService.register(body);
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

    // Returns either { accessToken } directly, or — if this account has 2FA
    // enabled — { twoFactorRequired: true, challengeToken } instead, which
    // the frontend must exchange via POST /auth/2fa/challenge.
    return this.authService.loginOrChallenge(body.email, body.password);
  }

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
    return this.authService.completeTwoFactorChallenge(
      body.challengeToken,
      body.code,
    );
  }

  @Get("2fa/status")
  @UseGuards(JwtAuthGuard)
  async twoFactorStatus(@CurrentUser() user: AuthenticatedUser) {
    return this.authService.getTwoFactorStatus(user.id);
  }

  @Post("2fa/setup")
  @UseGuards(JwtAuthGuard)
  async setupTwoFactor(@CurrentUser() user: AuthenticatedUser) {
    return this.authService.setupTwoFactor(user.id, user.email);
  }

  @Post("2fa/verify")
  @UseGuards(JwtAuthGuard)
  async verifyTwoFactorSetup(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(verifyTwoFactorSetupSchema))
    body: VerifyTwoFactorSetupDto,
  ) {
    return this.authService.verifyTwoFactorSetup(user.id, body.token);
  }

  @Post("2fa/disable")
  @UseGuards(JwtAuthGuard)
  async disableTwoFactor(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(disableTwoFactorSchema))
    body: DisableTwoFactorDto,
  ) {
    await this.authService.disableTwoFactor(user.id, body.password);
    return { message: "Two-factor authentication disabled" };
  }

  @ApiSession()
  @Get("session")
  session(@Req() req: Request): { user: AuthenticatedUser | null } {
    return { user: this.authService.verifySession(req.headers.authorization) };
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
    const user = await this.authService.validateOAuthLogin(
      req.user as OAuthProfile,
    );
    const { accessToken } = this.authService.issueToken(user);
    res.redirect(
      `${this.config.get("FRONTEND_URL", { infer: true })}/auth/callback?token=${accessToken}`,
    );
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
    const user = await this.authService.validateOAuthLogin(
      req.user as OAuthProfile,
    );
    const { accessToken } = this.authService.issueToken(user);
    res.redirect(
      `${this.config.get("FRONTEND_URL", { infer: true })}/auth/callback?token=${accessToken}`,
    );
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
