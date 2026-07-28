import { Injectable, Logger } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
// Native bcrypt (libuv threadpool), not bcryptjs: the pure-JS implementation
// burned main-thread CPU for the whole cost-12 hash (~hundreds of ms), stalling
// every other in-flight request during each login/register. Hashes are
// interchangeable between the two ($2a/$2b both verify).
import * as bcrypt from "bcrypt";
import * as crypto from "crypto";
<<<<<<< HEAD
import { generateSecret, generateURI, verify as verifyOtp } from "otplib";
import * as QRCode from "qrcode";
=======
>>>>>>> origin/main
import { Prisma } from "@prisma/client";
import { AuthRepository } from "./auth.repository";
import { AuthMapper } from "./auth.mapper";
import { RESET_TOKEN_TTL_MS, TWO_FACTOR_ISSUER } from "./constants";
import type { RegisterDto } from "./dto/register.dto";
import type {
  RegisteredUser,
  OAuthProfile,
  TwoFactorChallengePayload,
} from "./interfaces";
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

const BACKUP_CODE_COUNT = 8;
const TWO_FACTOR_CHALLENGE_TTL = "5m";

// Formatted like "A1B2C-D3E4F" — easy to read back when copying from a
// "save these somewhere safe" screen, unambiguous (uppercase hex only).
const generateBackupCodes = (count = BACKUP_CODE_COUNT): string[] =>
  Array.from({ length: count }, () => {
    const raw = crypto.randomBytes(5).toString("hex").toUpperCase();
    return `${raw.slice(0, 5)}-${raw.slice(5, 10)}`;
  });

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly authRepository: AuthRepository,
    private readonly jwtService: JwtService,
    private readonly emailService: EmailService,
  ) {}

  async register(dto: RegisterDto): Promise<RegisteredUser> {
    const existing = await this.authRepository.findUserIdByEmail(dto.email);
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
    // Deliberately does NOT block sign-in: the reference design's copy for
    // this state ("reactivate anytime") requires the user to be able to log
    // back in to flip it off from Settings. isPaused is a persisted flag with
    // no other reader yet — nothing currently hides a paused user's profile
    // from search or suppresses emails to them.
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
      const payload = this.jwtService.verify<JwtPayload & { purpose?: string }>(
        authorizationHeader.slice("Bearer ".length),
      );
      // A 2FA challenge token is signed with the same secret but carries no
      // real session — never treat it as "this caller is signed in".
      if (payload.purpose) return null;
      return AuthMapper.fromPayload(payload);
    } catch {
      return null;
    }
  }

  async validateOAuthLogin(profile: OAuthProfile): Promise<AuthenticatedUser> {
    const user = await this.authRepository.findOrCreateOAuthUser(profile);
    return AuthMapper.toAuthenticatedUser(user);
  }

  // Login's actual entry point (AuthController.login calls this, not
  // validateCredentials+issueToken directly): a 2FA-enabled account gets a
  // short-lived challenge token instead of a real one, and must complete
  // completeTwoFactorChallenge below to get an accessToken.
  async loginOrChallenge(
    email: string,
    password: string,
  ): Promise<
    | { accessToken: string }
    | { twoFactorRequired: true; challengeToken: string }
  > {
    const user = await this.validateCredentials(email, password);
    const state = await this.authRepository.findTwoFactorState(user.id);
    if (state?.twoFactorEnabled) {
      const challengePayload: TwoFactorChallengePayload = {
        sub: user.id,
        purpose: "2fa_challenge",
      };
      const challengeToken = this.jwtService.sign(challengePayload, {
        expiresIn: TWO_FACTOR_CHALLENGE_TTL,
      });
      return { twoFactorRequired: true, challengeToken };
    }
    return this.issueToken(user);
  }

  async getTwoFactorStatus(userId: string): Promise<{ enabled: boolean }> {
    const state = await this.authRepository.findTwoFactorState(userId);
    return { enabled: state?.twoFactorEnabled ?? false };
  }

  async setupTwoFactor(
    userId: string,
    email: string,
  ): Promise<{ secret: string; otpauthUrl: string; qrCodeDataUrl: string }> {
    const secret = generateSecret();
    await this.authRepository.setTwoFactorSecret(userId, secret);
    const otpauthUrl = generateURI({
      issuer: TWO_FACTOR_ISSUER,
      label: email,
      secret,
    });
    const qrCodeDataUrl = await QRCode.toDataURL(otpauthUrl);
    return { secret, otpauthUrl, qrCodeDataUrl };
  }

  // Confirms the authenticator app was set up correctly before flipping
  // twoFactorEnabled — otherwise a typo'd/mis-scanned secret would lock the
  // user out of their own account on the very next login.
  async verifyTwoFactorSetup(
    userId: string,
    token: string,
  ): Promise<{ backupCodes: string[] }> {
    const state = await this.authRepository.findTwoFactorState(userId);
    if (!state?.twoFactorSecret) {
      throw new BadRequestApiException(
        "Start two-factor setup first",
        ErrorCode.TWO_FACTOR_SETUP_REQUIRED,
      );
    }
    const { valid } = await verifyOtp({ token, secret: state.twoFactorSecret });
    if (!valid) {
      throw new BadRequestApiException(
        "Invalid code",
        ErrorCode.INVALID_TWO_FACTOR_CODE,
      );
    }

    const backupCodes = generateBackupCodes();
    const hashedBackupCodes = await Promise.all(
      backupCodes.map((code) => bcrypt.hash(code, BCRYPT_SALT_ROUNDS)),
    );
    await this.authRepository.enableTwoFactor(userId, hashedBackupCodes);
    // Plaintext codes are returned exactly once — only the bcrypt hashes are
    // ever persisted, same as a password.
    return { backupCodes };
  }

  async disableTwoFactor(userId: string, password: string): Promise<void> {
    const user = await this.authRepository.findUserById(userId);
    if (!user?.passwordHash) {
      throw new BadRequestApiException(
        "Password change is not available for social sign-in accounts.",
        ErrorCode.SOCIAL_ACCOUNT_NO_PASSWORD,
      );
    }
    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      throw new UnauthorizedApiException(
        "Incorrect password",
        ErrorCode.INVALID_CREDENTIALS,
      );
    }
    await this.authRepository.disableTwoFactor(userId);
  }

  async completeTwoFactorChallenge(
    challengeToken: string,
    code: string,
  ): Promise<{ accessToken: string }> {
    let payload: TwoFactorChallengePayload;
    try {
      payload =
        this.jwtService.verify<TwoFactorChallengePayload>(challengeToken);
    } catch {
      throw new UnauthorizedApiException(
        "This code has expired — please sign in again",
        ErrorCode.INVALID_CHALLENGE_TOKEN,
      );
    }
    if (payload.purpose !== "2fa_challenge") {
      throw new UnauthorizedApiException(
        "This code has expired — please sign in again",
        ErrorCode.INVALID_CHALLENGE_TOKEN,
      );
    }

    const user = await this.authRepository.findUserById(payload.sub);
    if (!user?.twoFactorEnabled || !user.twoFactorSecret) {
      throw new UnauthorizedApiException(
        "This code has expired — please sign in again",
        ErrorCode.INVALID_CHALLENGE_TOKEN,
      );
    }

    // otplib's verify() throws TokenLengthError for anything that isn't a
    // 6-digit string rather than returning { valid: false } — a backup code
    // (format XXXXX-XXXXX) would otherwise crash this into a 500. Only ever
    // attempt TOTP verification against a 6-digit code; anything else goes
    // straight to the backup-code check below.
    const isSixDigitCode = /^\d{6}$/.test(code);
    const isValidTotp =
      isSixDigitCode &&
      (await verifyOtp({ token: code, secret: user.twoFactorSecret })).valid;

    if (!isValidTotp) {
      // Not a TOTP code — try it as a single-use backup code instead.
      const normalizedCode = code.trim().toUpperCase();
      let matchedIndex = -1;
      for (let i = 0; i < user.twoFactorBackupCodes.length; i += 1) {
        // Sequential, not Promise.all — bcrypt.compare is CPU-bound (libuv
        // threadpool), and backup codes are consumed one at a time anyway;
        // no correctness issue either way, just avoids bursting the pool for
        // what's usually a 1-2 item array.
        // eslint-disable-next-line no-await-in-loop
        const matches = await bcrypt.compare(
          normalizedCode,
          user.twoFactorBackupCodes[i] as string,
        );
        if (matches) {
          matchedIndex = i;
          break;
        }
      }
      if (matchedIndex === -1) {
        throw new BadRequestApiException(
          "Invalid code",
          ErrorCode.INVALID_TWO_FACTOR_CODE,
        );
      }
      const remaining = [...user.twoFactorBackupCodes];
      remaining.splice(matchedIndex, 1);
      await this.authRepository.consumeBackupCode(user.id, remaining);
    }

    return this.issueToken(AuthMapper.toAuthenticatedUser(user));
  }

  async forgotPassword(email: string): Promise<void> {
    const user = await this.authRepository.findUserIdByEmail(email);
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
    const consumed = await this.authRepository.consumePasswordReset(
      record.identifier,
      token,
      passwordHash,
    );
    // false means a concurrent request already consumed this token between
    // the read above and this write (see consumePasswordReset) — same
    // response as an expired/unknown token, not a crash or a silent no-op.
    if (!consumed) {
      throw new BadRequestApiException(
        "Invalid or expired token",
        ErrorCode.INVALID_OR_EXPIRED_TOKEN,
      );
    }
  }
}
