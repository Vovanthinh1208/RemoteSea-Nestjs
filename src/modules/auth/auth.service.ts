import { Injectable, Logger } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
// Native bcrypt (libuv threadpool), not bcryptjs: the pure-JS implementation
// burned main-thread CPU for the whole cost-12 hash (~hundreds of ms), stalling
// every other in-flight request during each login/register. Hashes are
// interchangeable between the two ($2a/$2b both verify).
import * as bcrypt from "bcrypt";
import * as crypto from "crypto";
import { Prisma } from "@prisma/client";
import { AuthRepository } from "./auth.repository";
import { AuthMapper } from "./auth.mapper";
import { RESET_TOKEN_TTL_MS } from "./constants";
import type { RegisterDto } from "./dto/register.dto";
import type { RegisteredUser, OAuthProfile } from "./interfaces";
import { EmailService } from "@/common/services/email.service";
import { runInBackground } from "@/common/utils/background-task.util";
import { uniqueSlug } from "@/common/utils/slugify";
import { BCRYPT_SALT_ROUNDS } from "@/common/constants/bcrypt.constants";
import {
  BadRequestApiException,
  ConflictApiException,
  UnauthorizedApiException,
} from "@/common/exceptions/api.exception";
import { ErrorCode } from "@/common/exceptions/error-codes";
import type {
  AuthenticatedUser,
  JwtPayload,
} from "@/common/interfaces/authenticated-user.interface";

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly authRepository: AuthRepository,
    private readonly jwtService: JwtService,
    private readonly emailService: EmailService,
  ) {}

  async register(dto: RegisterDto): Promise<RegisteredUser> {
    const existing = await this.authRepository.findUserByEmail(dto.email);
    if (existing) {
      throw new ConflictApiException(
        "Email already registered",
        ErrorCode.EMAIL_ALREADY_REGISTERED,
      );
    }

    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_SALT_ROUNDS);
    let user: RegisteredUser;
    try {
      user = await this.authRepository.createUser({
        name: dto.name,
        email: dto.email,
        passwordHash,
        role: dto.role,
        talentSlug: dto.role === "TALENT" ? uniqueSlug(dto.name) : undefined,
      });
    } catch (error) {
      // The findUserByEmail check above is only a fast path — two concurrent
      // signups for the same email can both pass it before either writes,
      // and the loser hits the users_email_key unique constraint. Without
      // this, that race surfaces as GlobalExceptionFilter's generic P2002 ->
      // ErrorCode.CONFLICT instead of the same EMAIL_ALREADY_REGISTERED the
      // fast path above already promises callers for this exact condition.
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        throw new ConflictApiException(
          "Email already registered",
          ErrorCode.EMAIL_ALREADY_REGISTERED,
        );
      }
      throw error;
    }

    // The account is already created above — a welcome-email failure must not
    // turn a successful signup into a 500 (a retry would then wrongly hit
    // "Email already registered"). Background send: signup shouldn't wait out
    // an outbound HTTP round-trip whose failure was already swallowed anyway.
    runInBackground(
      this.emailService.sendWelcomeEmail(user.email, user.name ?? "there"),
      this.logger,
      `Failed to send welcome email for user ${user.id}`,
    );

    return user;
  }

  async validateCredentials(
    email: string,
    password: string,
  ): Promise<AuthenticatedUser> {
    const user = await this.authRepository.findUserByEmail(email);
    if (!user?.passwordHash) {
      throw new UnauthorizedApiException(
        "Invalid email or password",
        ErrorCode.INVALID_CREDENTIALS,
      );
    }
    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      throw new UnauthorizedApiException(
        "Invalid email or password",
        ErrorCode.INVALID_CREDENTIALS,
      );
    }
    return AuthMapper.toAuthenticatedUser(user);
  }

  issueToken(user: AuthenticatedUser): { accessToken: string } {
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    };
    return { accessToken: this.jwtService.sign(payload) };
  }

  // The inverse of issueToken — kept in this service (not AuthController) so
  // token issuance and verification live in one place instead of the
  // controller reaching around AuthService into JwtService directly, the way
  // it used to. Returns null (never throws) for any invalid/expired/missing
  // token: GET /session's contract is "who is the caller, if anyone" — an
  // absent-or-bad token means anonymous, not a request error.
  verifySession(
    authorizationHeader: string | undefined,
  ): AuthenticatedUser | null {
    if (!authorizationHeader?.startsWith("Bearer ")) return null;

    try {
      const payload = this.jwtService.verify<JwtPayload>(
        authorizationHeader.slice("Bearer ".length),
      );
      return AuthMapper.fromPayload(payload);
    } catch {
      return null;
    }
  }

  async validateOAuthLogin(profile: OAuthProfile): Promise<AuthenticatedUser> {
    const user = await this.authRepository.findOrCreateOAuthUser(profile);
    return AuthMapper.toAuthenticatedUser(user);
  }

  async forgotPassword(email: string): Promise<void> {
    const user = await this.authRepository.findUserByEmail(email);
    if (!user) return;

    const token = crypto.randomBytes(32).toString("hex");
    await this.authRepository.createVerificationToken(
      email,
      token,
      new Date(Date.now() + RESET_TOKEN_TTL_MS),
    );
    // Background send: the response no longer waits out the Resend round-trip.
    // Note this only removes the email leg of the known-vs-unknown-email timing
    // difference — the token write above still runs only for known emails, so
    // response timing remains an account-enumeration signal. Closing that fully
    // would mean doing equal work on both paths; accepted for now since the
    // register endpoint already confirms address existence outright.
    runInBackground(
      this.emailService.sendPasswordResetEmail(email, token),
      this.logger,
      `Failed to send password-reset email for user ${user.id}`,
    );
  }

  async resetPassword(token: string, password: string): Promise<void> {
    const record = await this.authRepository.findVerificationToken(token);
    if (!record || record.expires < new Date()) {
      throw new BadRequestApiException(
        "Invalid or expired token",
        ErrorCode.INVALID_OR_EXPIRED_TOKEN,
      );
    }

    const passwordHash = await bcrypt.hash(password, BCRYPT_SALT_ROUNDS);
    await this.authRepository.consumePasswordReset(
      record.identifier,
      token,
      passwordHash,
    );
  }
}
