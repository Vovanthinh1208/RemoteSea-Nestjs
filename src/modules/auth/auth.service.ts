import { Injectable, Logger } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
// Native bcrypt (libuv threadpool), not bcryptjs: the pure-JS implementation
// burned main-thread CPU for the whole cost-12 hash (~hundreds of ms), stalling
// every other in-flight request during each login/register. Hashes are
// interchangeable between the two ($2a/$2b both verify).
import * as bcrypt from "bcrypt";
import * as crypto from "crypto";
import { generateSecret, generateURI, verify as verifyOtp } from "otplib";
import * as QRCode from "qrcode";
import { Prisma } from "@prisma/client";
import { AuthRepository, type SessionMeta } from "./auth.repository";
import { AuthMapper } from "./auth.mapper";
import {
  OAUTH_EXCHANGE_TTL,
  RESET_TOKEN_TTL_MS,
  TWO_FACTOR_ISSUER,
} from "./constants";
import type { RegisterDto } from "./dto/register.dto";
import type {
  RegisteredUser,
  OAuthExchangePayload,
  OAuthLinkIntentPayload,
  OAuthProfile,
  OAuthProviderName,
  TwoFactorChallengePayload,
} from "./interfaces";
import { EmailService } from "@/common/services/email.service";
import { runInBackground } from "@/common/utils/background-task.util";
import { uniqueSlug } from "@/common/utils/slugify";
import { BCRYPT_SALT_ROUNDS } from "@/common/constants/bcrypt.constants";
import {
  BadRequestApiException,
  ConflictApiException,
  ForbiddenApiException,
  NotFoundApiException,
  UnauthorizedApiException,
} from "@/common/exceptions/api.exception";
import { ErrorCode } from "@/common/exceptions/error-codes";
import type {
  AuthenticatedUser,
  JwtPayload,
} from "@/common/interfaces/authenticated-user.interface";
import { parseUserAgent } from "@/common/utils/user-agent.util";
import { lookupIpLocation } from "@/common/utils/geo-ip.util";
import { MetricsService } from "@/modules/metrics/metrics.service";

// SHA-256 is enough here: the token is 256 random bits, not a human secret.
const hashResetToken = (token: string): string =>
  crypto.createHash("sha256").update(token).digest("hex");

// PB10: ten single-use recovery codes.
const BACKUP_CODE_COUNT = 10;
const TWO_FACTOR_CHALLENGE_TTL = "5m";
const OAUTH_LINK_INTENT_TTL = "10m";

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
    private readonly metricsService: MetricsService,
  ) {}

  async register(
    dto: RegisterDto,
    sessionMeta: SessionMeta = {},
  ): Promise<{ user: RegisteredUser; accessToken: string }> {
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

    // Auto-login on register: a brand-new account never has 2FA enabled, so
    // this can always issue a real token directly instead of making the
    // frontend fire a separate POST /auth/login (+ GET /auth/session) right
    // after this call returns.
    const { accessToken } = await this.issueToken(user, sessionMeta);
    return { user, accessToken };
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
    // Unlike isPaused below, a ban DOES block sign-in — there's no
    // "reactivate anytime" self-service path for it, only an admin lifting
    // it (AdminService.updateUser). Checked after the password compare
    // above (not before, e.g. via a single combined query) so a banned
    // user gets the same INVALID_CREDENTIALS response as a wrong password
    // when they mistype it — banned status is only revealed once they've
    // proven they're really the account owner.
    if (user.bannedAt) {
      throw new ForbiddenApiException(
        "This account has been banned",
        ErrorCode.ACCOUNT_BANNED,
      );
    }
    // Deliberately does NOT block sign-in: the reference design's copy for
    // this state ("reactivate anytime") requires the user to be able to log
    // back in to flip it off from Settings. isPaused is a persisted flag with
    // no other reader yet — nothing currently hides a paused user's profile
    // from search or suppresses emails to them.
    return AuthMapper.toAuthenticatedUser(user);
  }

  // Creates the Session row this token's `sid` claim points to — every real
  // access token traces back to exactly one row here, which is what makes it
  // individually revocable (see JwtStrategy.validate and revokeSession below).
  async issueToken(
    user: AuthenticatedUser,
    sessionMeta: { userAgent?: string; ip?: string } = {},
  ): Promise<{ accessToken: string; user: AuthenticatedUser }> {
    const session = await this.authRepository.createSession(
      user.id,
      sessionMeta,
    );
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      sid: session.id,
    };
    // Bundles `user` alongside the token so callers (login, register, 2FA
    // challenge) can hand the frontend a ready session in one response
    // instead of forcing an immediate follow-up GET /auth/session.
    return { accessToken: this.jwtService.sign(payload), user };
  }

  // The inverse of issueToken — kept in this service (not AuthController) so
  // token issuance and verification live in one place instead of the
  // controller reaching around AuthService into JwtService directly, the way
  // it used to. Returns null (never throws) for any invalid/expired/missing
  // token: GET /session's contract is "who is the caller, if anyone" — an
  // absent-or-bad token means anonymous, not a request error.
  async verifySession(
    authorizationHeader: string | undefined,
  ): Promise<AuthenticatedUser | null> {
    if (!authorizationHeader?.startsWith("Bearer ")) return null;

    try {
      const payload = this.jwtService.verify<JwtPayload & { purpose?: string }>(
        authorizationHeader.slice("Bearer ".length),
      );
      // A 2FA challenge token is signed with the same secret but carries no
      // real session — never treat it as "this caller is signed in".
      if (payload.purpose) return null;
      // Same revocation check as JwtStrategy.validate — a signed-out (or
      // legacy pre-sid) token must read as anonymous here too, not just on
      // JwtAuthGuard-protected routes.
      if (!payload.sid) return null;
      const session = await this.authRepository.findSessionState(payload.sid);
      if (!session || session.revokedAt) return null;
      return AuthMapper.fromPayload(payload);
    } catch {
      return null;
    }
  }

  async getSessionProfile(userId: string) {
    const user = await this.authRepository.findSessionProfile(userId);
    if (!user) {
      throw new UnauthorizedApiException(
        "Session expired — please sign in again",
        ErrorCode.INVALID_CREDENTIALS,
      );
    }
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      // The application authorizes with role guards; expose the current role
      // as the only permission scope instead of inventing per-action grants.
      permissions: [user.role],
      avatar: user.image,
    };
  }

  async validateOAuthLogin(profile: OAuthProfile): Promise<AuthenticatedUser> {
    const user = await this.authRepository.findOrCreateOAuthUser(profile);
    return AuthMapper.toAuthenticatedUser(user);
  }

  // AuthController.handleOAuthCallback mints this instead of issuing a real
  // access token directly into the redirect URL — see OAuthExchangePayload
  // for why. issueToken (and the Session row it creates) is deferred to
  // completeOAuthExchange below, once the frontend actually redeems the
  // code, rather than created here and possibly never claimed.
  createOAuthExchangeCode(userId: string): string {
    const payload: OAuthExchangePayload = {
      sub: userId,
      purpose: "oauth_exchange",
    };
    return this.jwtService.sign(payload, { expiresIn: OAUTH_EXCHANGE_TTL });
  }

  // POST /auth/oauth/exchange's handler — the frontend's callback page calls
  // this immediately on landing to swap the short-lived `?code=` for a real
  // session, the same shape login/register/2FA-challenge already return.
  async completeOAuthExchange(
    code: string,
    sessionMeta: SessionMeta = {},
  ): Promise<{ accessToken: string; user: AuthenticatedUser }> {
    let payload: OAuthExchangePayload;
    try {
      payload = this.jwtService.verify<
        OAuthExchangePayload & { purpose?: string }
      >(code);
    } catch {
      throw new UnauthorizedApiException(
        "This sign-in link has expired — please try again",
        ErrorCode.INVALID_OAUTH_EXCHANGE_CODE,
      );
    }
    if (payload.purpose !== "oauth_exchange") {
      throw new UnauthorizedApiException(
        "This sign-in link has expired — please try again",
        ErrorCode.INVALID_OAUTH_EXCHANGE_CODE,
      );
    }

    const user = await this.authRepository.findUserById(payload.sub);
    if (!user) {
      throw new UnauthorizedApiException(
        "This sign-in link has expired — please try again",
        ErrorCode.INVALID_OAUTH_EXCHANGE_CODE,
      );
    }

    return this.issueToken(AuthMapper.toAuthenticatedUser(user), sessionMeta);
  }

  // Settings > Connected accounts "Connect". Minted by GET /auth/:provider/link
  // (JwtAuthGuard-protected) and carried through the provider's consent screen
  // as the OAuth `state` param — the shared callback route in AuthController
  // decodes it to tell "someone is linking a new provider to their existing,
  // already-authenticated account" apart from an ordinary sign-in attempt.
  createOAuthLinkIntent(userId: string, provider: OAuthProviderName): string {
    const linkPayload: OAuthLinkIntentPayload = {
      sub: userId,
      provider,
      purpose: "oauth_link",
    };
    return this.jwtService.sign(linkPayload, {
      expiresIn: OAUTH_LINK_INTENT_TTL,
    });
  }

  // Returns null (never throws) for anything that isn't a currently-valid
  // link intent for this exact provider — the callback route treats that the
  // same as "no state was ever sent," i.e. falls back to a normal login.
  verifyOAuthLinkIntent(
    state: string | undefined,
    expectedProvider: OAuthProviderName,
  ): OAuthLinkIntentPayload | null {
    if (!state) return null;
    try {
      const payload = this.jwtService.verify<
        OAuthLinkIntentPayload & { purpose?: string }
      >(state);
      if (
        payload.purpose !== "oauth_link" ||
        payload.provider !== expectedProvider
      ) {
        return null;
      }
      return payload;
    } catch {
      return null;
    }
  }

  async linkOAuthAccount(userId: string, profile: OAuthProfile): Promise<void> {
    const existing = await this.authRepository.findAccountByProvider(
      profile.provider,
      profile.providerAccountId,
    );
    if (existing && existing.userId !== userId) {
      throw new ConflictApiException(
        `This ${profile.provider} account is already connected to a different RemoteSEA account.`,
        ErrorCode.CONNECTION_ALREADY_LINKED,
      );
    }
    if (existing) return; // Already linked to this same account — no-op.
    await this.authRepository.createOAuthConnection(userId, profile);
  }

  // Login's actual entry point (AuthController.login calls this, not
  // validateCredentials+issueToken directly): a 2FA-enabled account gets a
  // short-lived challenge token instead of a real one, and must complete
  // completeTwoFactorChallenge below to get an accessToken.
  async loginOrChallenge(
    email: string,
    password: string,
    sessionMeta: SessionMeta = {},
  ): Promise<
    | { accessToken: string; user: AuthenticatedUser }
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
    return this.issueToken(user, sessionMeta);
  }

  async getTwoFactorStatus(userId: string): Promise<{ enabled: boolean }> {
    const state = await this.authRepository.findTwoFactorState(userId);
    return { enabled: state?.twoFactorEnabled ?? false };
  }

  async setupTwoFactor(
    userId: string,
    email: string,
  ): Promise<{ secret: string; otpauthUrl: string; qrCodeDataUrl: string }> {
    // Re-running setup while 2FA is active would overwrite the secret the
    // user's authenticator already holds and lock them out of login.
    const state = await this.authRepository.findTwoFactorState(userId);
    if (state?.twoFactorEnabled) {
      throw new ConflictApiException(
        "Two-factor authentication is already enabled",
        ErrorCode.TWO_FACTOR_ALREADY_ENABLED,
      );
    }
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
    // Checked before the password verification below — this is the
    // account's own current state, not information a caller could use
    // against a *different* account (the route already scopes `userId` to
    // whoever's JWT this is), so short-circuiting here first is a plain
    // idempotency check, not an information-disclosure tradeoff. Matters in
    // practice: without it, a second disable call after the first one
    // already succeeded would re-verify the password, no-op the DB update,
    // and *still* revoke every session again for no reason.
    if (!user.twoFactorEnabled) {
      throw new BadRequestApiException(
        "Two-factor authentication is already disabled",
        ErrorCode.TWO_FACTOR_NOT_ENABLED,
      );
    }
    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      // The alertable signal behind "repeated failed password verification"
      // — see MetricsService.authFailuresTotal. Never logs the password
      // itself, only that an attempt against this account failed.
      this.metricsService.recordAuthFailure("2fa_disable_invalid_password");
      throw new UnauthorizedApiException(
        "Incorrect password",
        ErrorCode.INVALID_CREDENTIALS,
      );
    }
    await this.authRepository.disableTwoFactor(userId);
    runInBackground(
      this.emailService.sendTwoFactorDisabledEmail(
        user.email,
        user.name ?? "there",
      ),
      this.logger,
      "Failed to send 2FA-disabled security email",
    );
    // Turning off 2FA is a real security-posture downgrade — same reasoning
    // as AdminService.updateUser revoking every session on a ban/role
    // change: if this request came from someone who has the password but
    // isn't the account owner (credential-stuffing, a shared/reused
    // password), every *other* live session — including one the real owner
    // still has open — gets forced back through login instead of silently
    // trusting whatever session state predates this change. This request's
    // own session ends too; the client already has its success response by
    // the time that matters.
    await this.revokeAllSessionsForUser(userId);
  }

  // Decodes just enough of a 2FA challenge token to rate-limit by target
  // account before actually attempting the code — AuthController.
  // twoFactorChallenge calls this ahead of completeTwoFactorChallenge so a
  // TOTP brute force spread across many source IPs still gets throttled per
  // victim account, not just per IP. Returns null (never throws) for
  // anything that isn't a currently-valid challenge token, same as
  // verifyOAuthLinkIntent above — an invalid/garbage token has no account
  // to rate-limit by, and still fails completeTwoFactorChallenge's own
  // verification (and remains covered by the per-IP limiter regardless).
  decodeTwoFactorChallengeSubject(challengeToken: string): string | null {
    try {
      const payload = this.jwtService.verify<
        TwoFactorChallengePayload & { purpose?: string }
      >(challengeToken);
      return payload.purpose === "2fa_challenge" ? payload.sub : null;
    } catch {
      return null;
    }
  }

  async completeTwoFactorChallenge(
    challengeToken: string,
    code: string,
    sessionMeta: SessionMeta = {},
  ): Promise<{ accessToken: string; user: AuthenticatedUser }> {
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
      // PB10 issues 10 codes. Checked one after another, a wrong code cost ten
      // bcrypt rounds in series (~3.5 s measured); in parallel they spread over
      // the libuv threadpool (~1 s). Same result, same hash strength.
      const comparisons = await Promise.all(
        user.twoFactorBackupCodes.map((hash) =>
          bcrypt.compare(normalizedCode, hash),
        ),
      );
      const matchedIndex = comparisons.indexOf(true);
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

    return this.issueToken(AuthMapper.toAuthenticatedUser(user), sessionMeta);
  }

  async forgotPassword(email: string): Promise<void> {
    const user = await this.authRepository.findUserIdByEmail(email);
    if (!user) return;

    const token = crypto.randomBytes(32).toString("hex");
    // Only the hash is stored: a leaked database row can't be replayed as a
    // reset link. The raw token travels only in the email.
    await this.authRepository.createVerificationToken(
      email,
      hashResetToken(token),
      new Date(Date.now() + RESET_TOKEN_TTL_MS),
    );
    // Background send: the response no longer waits out the SMTP round-trip.
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
    const tokenHash = hashResetToken(token);
    const record = await this.authRepository.findVerificationToken(tokenHash);
    if (!record || record.expires < new Date()) {
      throw new BadRequestApiException(
        "Invalid or expired token",
        ErrorCode.INVALID_OR_EXPIRED_TOKEN,
      );
    }

    const passwordHash = await bcrypt.hash(password, BCRYPT_SALT_ROUNDS);
    const consumed = await this.authRepository.consumePasswordReset(
      record.identifier,
      tokenHash,
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

  // Settings > Security "Active sessions".
  async listSessions(
    userId: string,
    currentSessionId: string,
  ): Promise<
    {
      id: string;
      device: string;
      ip: string | null;
      location: string | null;
      createdAt: Date;
      lastSeenAt: Date;
      current: boolean;
    }[]
  > {
    const sessions = await this.authRepository.listActiveSessions(userId);
    return sessions.map((s) => ({
      id: s.id,
      device: parseUserAgent(s.userAgent),
      ip: s.ip,
      // Resolved at read time from the raw IP (same reasoning as `device`
      // above) — null for anything geoip-lite can't resolve, which is the
      // normal case for loopback/private ranges in local development.
      location: lookupIpLocation(s.ip),
      createdAt: s.createdAt,
      lastSeenAt: s.lastSeenAt,
      current: s.id === currentSessionId,
    }));
  }

  async revokeSession(
    userId: string,
    sessionId: string,
    currentSessionId: string,
  ): Promise<void> {
    // The UI never offers a "Revoke" action for the current device (see the
    // remotesea design reference) — this is the server-side backstop for
    // that, not a substitute for the regular sign-out flow.
    if (sessionId === currentSessionId) {
      throw new BadRequestApiException(
        "Sign out to end your current session instead of revoking it here.",
        ErrorCode.CANNOT_REVOKE_CURRENT_SESSION,
      );
    }
    const revoked = await this.authRepository.revokeSession(userId, sessionId);
    if (!revoked) {
      throw new NotFoundApiException(
        "Session not found",
        ErrorCode.SESSION_NOT_FOUND,
      );
    }
  }

  async revokeOtherSessions(
    userId: string,
    currentSessionId: string,
  ): Promise<{ revokedCount: number }> {
    const revokedCount = await this.authRepository.revokeOtherSessions(
      userId,
      currentSessionId,
    );
    return { revokedCount };
  }

  // Called by AdminService.updateUser on ban/role-change — the mechanism
  // behind "JWT role never re-validated" in the audit: rather than reading
  // role/bannedAt fresh from the DB on every request (an extra query on
  // every hot path), every existing session is force-revoked the moment
  // either changes, and JwtStrategy's per-request revocation check (already
  // a DB read on every request, for this exact reason) is what closes the
  // stale-privilege window on the next request either way.
  async revokeAllSessionsForUser(userId: string): Promise<number> {
    return this.authRepository.revokeAllSessions(userId);
  }
}
