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
import { JwtService } from "@nestjs/jwt";
import type { Request, Response } from "express";
import { AuthService } from "./auth.service";
import { AuthMapper } from "./auth.mapper";
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
import { RATE_LIMITS } from "./constants";
import { ZodValidationPipe } from "@/core/pipes/zod-validation.pipe";
import {
  RateLimitService,
  clientIp,
} from "@/common/services/rate-limit.service";
import type { EnvConfig } from "@/core/config/env.validation";
import type {
  AuthenticatedUser,
  JwtPayload,
} from "@/common/interfaces/authenticated-user.interface";
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
    private readonly jwtService: JwtService,
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
    );
    // body.email is already normalized by loginSchema (emailSchema), so this and the
    // actual auth lookup in validateCredentials are guaranteed to agree on identity.
    this.rateLimitService.enforce(
      `login-email:${body.email}`,
      RATE_LIMITS.LOGIN.limit,
      RATE_LIMITS.LOGIN.windowMs,
    );

    const user = await this.authService.validateCredentials(
      body.email,
      body.password,
    );
    return this.authService.issueToken(user);
  }

  @ApiSession()
  @Get("session")
  async session(
    @Req() req: Request,
  ): Promise<{ user: AuthenticatedUser | null }> {
    const header = req.headers.authorization;
    if (!header?.startsWith("Bearer ")) return { user: null };

    try {
      const payload = this.jwtService.verify<JwtPayload>(
        header.slice("Bearer ".length),
      );
      return { user: AuthMapper.fromPayload(payload) };
    } catch {
      return { user: null };
    }
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
    );
    await this.authService.resetPassword(body.token, body.password);
    return { message: "Password updated" };
  }
}
