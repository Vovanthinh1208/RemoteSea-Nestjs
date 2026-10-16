import * as crypto from "crypto";
import * as bcrypt from "bcrypt";
import { Prisma } from "@prisma/client";
import { AuthService } from "./auth.service";
import type { AuthRepository } from "./auth.repository";
import type { EmailService } from "@/common/services/email.service";
import {
  BadRequestApiException,
  ConflictApiException,
  ForbiddenApiException,
  UnauthorizedApiException,
} from "@/common/exceptions/api.exception";
import { ErrorCode } from "@/common/exceptions/error-codes";

jest.mock("bcrypt");

// Every login/register/reset-password code path is worth its own coverage
// here, given how easy a small refactor could make one of them silently
// permissive (e.g. accepting an expired reset token, or a social-only
// account's empty passwordHash).

const makeService = (overrides?: {
  authRepository?: Partial<AuthRepository>;
  emailService?: Partial<EmailService>;
  jwtService?: { sign: jest.Mock; verify?: jest.Mock };
  metricsService?: { recordAuthFailure: jest.Mock };
}) => {
  const authRepository = {
    findUserByEmail: jest.fn(),
    findUserIdByEmail: jest.fn(),
    createUser: jest.fn(),
    createSession: jest.fn().mockResolvedValue({ id: "s1" }),
    findSessionState: jest
      .fn()
      .mockResolvedValue({ id: "s1", revokedAt: null }),
    findOrCreateOAuthUser: jest.fn(),
    createVerificationToken: jest.fn(),
    findVerificationToken: jest.fn(),
    consumePasswordReset: jest.fn().mockResolvedValue(true),
    ...overrides?.authRepository,
  };
  const emailService = {
    sendWelcomeEmail: jest.fn().mockResolvedValue(undefined),
    sendPasswordResetEmail: jest.fn().mockResolvedValue(undefined),
    ...overrides?.emailService,
  };
  const jwtService = overrides?.jwtService ?? {
    sign: jest.fn().mockReturnValue("signed.jwt.token"),
    verify: jest.fn(),
  };
  const metricsService = overrides?.metricsService ?? {
    recordAuthFailure: jest.fn(),
  };

  const service = new AuthService(
    authRepository as unknown as AuthRepository,
    jwtService as never,
    emailService as unknown as EmailService,
    metricsService as never,
  );
  return { service, authRepository, emailService, jwtService, metricsService };
};

describe("AuthService.register", () => {
  it("rejects a duplicate email", async () => {
    const { service, authRepository } = makeService({
      authRepository: {
        findUserIdByEmail: jest.fn().mockResolvedValue({ id: "u1" }),
      },
    });

    await expect(
      service.register({
        name: "A",
        email: "a@b.com",
        password: "password123",
        role: "TALENT",
      }),
    ).rejects.toBeInstanceOf(ConflictApiException);
    expect(authRepository.createUser).not.toHaveBeenCalled();
  });

  it("maps a P2002 race on the unique email constraint to EMAIL_ALREADY_REGISTERED, not a generic conflict", async () => {
    const { service } = makeService({
      authRepository: {
        // Fast path sees no existing user — a concurrent duplicate signup
        // still races past this and hits the DB constraint below.
        findUserIdByEmail: jest.fn().mockResolvedValue(null),
        createUser: jest.fn().mockRejectedValue(
          new Prisma.PrismaClientKnownRequestError("duplicate", {
            code: "P2002",
            clientVersion: "5.22.0",
          }),
        ),
      },
    });

    const error = await service
      .register({
        name: "A",
        email: "a@b.com",
        password: "password123",
        role: "TALENT",
      })
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ConflictApiException);
    expect((error as ConflictApiException).getResponse()).toMatchObject({
      code: ErrorCode.EMAIL_ALREADY_REGISTERED,
    });
  });

  it("hashes the password and generates a talent slug only for TALENT signups", async () => {
    (bcrypt.hash as jest.Mock).mockResolvedValue("hashed-pw");
    const createUser = jest.fn().mockResolvedValue({
      id: "u1",
      email: "a@b.com",
      name: "A",
      role: "EMPLOYER",
    });
    const { service } = makeService({
      authRepository: {
        findUserIdByEmail: jest.fn().mockResolvedValue(null),
        createUser,
      },
    });

    await service.register({
      name: "A",
      email: "a@b.com",
      password: "password123",
      role: "EMPLOYER",
    });

    expect(bcrypt.hash).toHaveBeenCalledWith("password123", expect.any(Number));
    expect(createUser).toHaveBeenCalledWith(
      expect.objectContaining({
        passwordHash: "hashed-pw",
        talentSlug: undefined,
      }),
    );
  });

  it("sends a welcome email in the background without blocking the response", async () => {
    (bcrypt.hash as jest.Mock).mockResolvedValue("hashed-pw");
    const registered = {
      id: "u1",
      email: "a@b.com",
      name: "A",
      role: "TALENT",
    };
    const { service, emailService } = makeService({
      authRepository: {
        findUserIdByEmail: jest.fn().mockResolvedValue(null),
        createUser: jest.fn().mockResolvedValue(registered),
      },
    });

    const result = await service.register({
      name: "A",
      email: "a@b.com",
      password: "password123",
      role: "TALENT",
    });

    expect(result).toEqual({
      user: registered,
      accessToken: "signed.jwt.token",
    });
    expect(emailService.sendWelcomeEmail).toHaveBeenCalledWith("a@b.com", "A");
  });
});

describe("AuthService.validateCredentials", () => {
  it("rejects when no user exists for the email", async () => {
    const { service } = makeService({
      authRepository: { findUserByEmail: jest.fn().mockResolvedValue(null) },
    });

    await expect(
      service.validateCredentials("a@b.com", "password123"),
    ).rejects.toBeInstanceOf(UnauthorizedApiException);
  });

  it("rejects a social-login-only account (no passwordHash)", async () => {
    const { service } = makeService({
      authRepository: {
        findUserByEmail: jest.fn().mockResolvedValue({
          id: "u1",
          email: "a@b.com",
          passwordHash: null,
        }),
      },
    });

    await expect(
      service.validateCredentials("a@b.com", "password123"),
    ).rejects.toBeInstanceOf(UnauthorizedApiException);
    expect(bcrypt.compare).not.toHaveBeenCalled();
  });

  it("rejects an incorrect password", async () => {
    (bcrypt.compare as jest.Mock).mockResolvedValue(false);
    const { service } = makeService({
      authRepository: {
        findUserByEmail: jest.fn().mockResolvedValue({
          id: "u1",
          email: "a@b.com",
          passwordHash: "hash",
        }),
      },
    });

    await expect(
      service.validateCredentials("a@b.com", "wrong"),
    ).rejects.toBeInstanceOf(UnauthorizedApiException);
  });

  it("returns the mapped user on a correct password", async () => {
    (bcrypt.compare as jest.Mock).mockResolvedValue(true);
    const { service } = makeService({
      authRepository: {
        findUserByEmail: jest.fn().mockResolvedValue({
          id: "u1",
          email: "a@b.com",
          passwordHash: "hash",
          name: "A",
          role: "TALENT",
        }),
      },
    });

    const result = await service.validateCredentials("a@b.com", "correct");
    expect(result).toEqual({
      id: "u1",
      email: "a@b.com",
      name: "A",
      role: "TALENT",
    });
  });

  // Unlike isPaused (self-service, doesn't block sign-in), a ban DOES —
  // there's no "reactivate anytime" path for it, only an admin lifting it.
  it("rejects a banned user's otherwise-correct credentials with ACCOUNT_BANNED", async () => {
    (bcrypt.compare as jest.Mock).mockResolvedValue(true);
    const { service } = makeService({
      authRepository: {
        findUserByEmail: jest.fn().mockResolvedValue({
          id: "u1",
          email: "a@b.com",
          passwordHash: "hash",
          name: "A",
          role: "TALENT",
          bannedAt: new Date("2026-01-01"),
        }),
      },
    });

    const error = await service
      .validateCredentials("a@b.com", "correct")
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ForbiddenApiException);
    expect((error as ForbiddenApiException).getResponse()).toMatchObject({
      code: ErrorCode.ACCOUNT_BANNED,
    });
  });
});

describe("AuthService.issueToken", () => {
  it("signs a JWT payload derived from the authenticated user", async () => {
    const { service, jwtService, authRepository } = makeService();
    const user = {
      id: "u1",
      email: "a@b.com",
      name: "A",
      role: "TALENT",
    };

    const result = await service.issueToken(user as never);

    expect(authRepository.createSession).toHaveBeenCalledWith("u1", {});
    expect(jwtService.sign).toHaveBeenCalledWith({
      sub: "u1",
      email: "a@b.com",
      name: "A",
      role: "TALENT",
      sid: "s1",
    });
    expect(result).toEqual({ accessToken: "signed.jwt.token", user });
  });
});

describe("AuthService.verifySession", () => {
  it("returns null when there's no Authorization header", async () => {
    const { service } = makeService();
    await expect(service.verifySession(undefined)).resolves.toBeNull();
  });

  it("returns null for a non-****** header", async () => {
    const { service } = makeService();
    await expect(service.verifySession("Basic abc123")).resolves.toBeNull();
  });

  it("returns null (not a throw) for an invalid/expired token", async () => {
    const verify = jest.fn().mockImplementation(() => {
      throw new Error("jwt expired");
    });
    const { service } = makeService({
      jwtService: { sign: jest.fn(), verify },
    });

    await expect(
      service.verifySession("Be" + "arer bad.token"),
    ).resolves.toBeNull();
  });

  it("maps a valid token's payload to an AuthenticatedUser", async () => {
    const verify = jest.fn().mockReturnValue({
      sub: "u1",
      email: "a@b.com",
      name: "A",
      role: "TALENT",
      sid: "s1",
    });
    const findSessionState = jest
      .fn()
      .mockResolvedValue({ id: "s1", revokedAt: null });
    const { service } = makeService({
      jwtService: { sign: jest.fn(), verify },
      authRepository: { findSessionState },
    });

    const result = await service.verifySession("Be" + "arer good.token");

    expect(verify).toHaveBeenCalledWith("good.token");
    expect(findSessionState).toHaveBeenCalledWith("s1");
    expect(result).toEqual({
      id: "u1",
      email: "a@b.com",
      name: "A",
      role: "TALENT",
    });
  });
});

describe("AuthService.createOAuthExchangeCode / completeOAuthExchange", () => {
  it("signs a short-lived, purpose-scoped code rather than a real access token", () => {
    const sign = jest.fn().mockReturnValue("exchange.code");
    const { service } = makeService({
      jwtService: { sign, verify: jest.fn() },
    });

    const code = service.createOAuthExchangeCode("u1");

    expect(sign).toHaveBeenCalledWith(
      { sub: "u1", purpose: "oauth_exchange" },
      { expiresIn: "60s" },
    );
    expect(code).toBe("exchange.code");
  });

  it("rejects an invalid/expired exchange code", async () => {
    const verify = jest.fn().mockImplementation(() => {
      throw new Error("jwt expired");
    });
    const { service } = makeService({
      jwtService: { sign: jest.fn(), verify },
    });

    const error = await service
      .completeOAuthExchange("bad.code")
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(UnauthorizedApiException);
    expect((error as UnauthorizedApiException).getResponse()).toMatchObject({
      code: ErrorCode.INVALID_OAUTH_EXCHANGE_CODE,
    });
  });

  it("rejects a token that decodes but isn't an oauth_exchange purpose (e.g. a real access token)", async () => {
    const verify = jest.fn().mockReturnValue({ sub: "u1" });
    const { service } = makeService({
      jwtService: { sign: jest.fn(), verify },
    });

    const error = await service
      .completeOAuthExchange("some.access.token")
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(UnauthorizedApiException);
    expect((error as UnauthorizedApiException).getResponse()).toMatchObject({
      code: ErrorCode.INVALID_OAUTH_EXCHANGE_CODE,
    });
  });

  it("rejects a valid code whose account no longer exists", async () => {
    const verify = jest
      .fn()
      .mockReturnValue({ sub: "u1", purpose: "oauth_exchange" });
    const { service } = makeService({
      jwtService: { sign: jest.fn(), verify },
      authRepository: { findUserById: jest.fn().mockResolvedValue(null) },
    });

    const error = await service
      .completeOAuthExchange("good.code")
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(UnauthorizedApiException);
    expect((error as UnauthorizedApiException).getResponse()).toMatchObject({
      code: ErrorCode.INVALID_OAUTH_EXCHANGE_CODE,
    });
  });

  it("issues a real session for a valid code and existing account", async () => {
    const verify = jest
      .fn()
      .mockReturnValue({ sub: "u1", purpose: "oauth_exchange" });
    const sign = jest.fn().mockReturnValue("signed.jwt.token");
    const findUserById = jest.fn().mockResolvedValue({
      id: "u1",
      email: "a@b.com",
      name: "A",
      role: "TALENT",
    });
    const { service } = makeService({
      jwtService: { sign, verify },
      authRepository: { findUserById },
    });

    const result = await service.completeOAuthExchange("good.code", {
      ip: "1.2.3.4",
    });

    expect(findUserById).toHaveBeenCalledWith("u1");
    expect(result).toEqual({
      accessToken: "signed.jwt.token",
      user: { id: "u1", email: "a@b.com", name: "A", role: "TALENT" },
    });
  });
});

describe("AuthService.decodeTwoFactorChallengeSubject", () => {
  it("returns null (not a throw) for an invalid/expired token", () => {
    const verify = jest.fn().mockImplementation(() => {
      throw new Error("jwt expired");
    });
    const { service } = makeService({
      jwtService: { sign: jest.fn(), verify },
    });

    expect(service.decodeTwoFactorChallengeSubject("bad.token")).toBeNull();
  });

  it("returns null for a token whose purpose isn't 2fa_challenge (e.g. a real access token)", () => {
    const verify = jest.fn().mockReturnValue({ sub: "u1" });
    const { service } = makeService({
      jwtService: { sign: jest.fn(), verify },
    });

    expect(
      service.decodeTwoFactorChallengeSubject("some.access.token"),
    ).toBeNull();
  });

  it("returns the target account id for a valid challenge token", () => {
    const verify = jest
      .fn()
      .mockReturnValue({ sub: "u1", purpose: "2fa_challenge" });
    const { service } = makeService({
      jwtService: { sign: jest.fn(), verify },
    });

    expect(
      service.decodeTwoFactorChallengeSubject("good.challenge.token"),
    ).toBe("u1");
  });
});

describe("AuthService.forgotPassword", () => {
  it("is a no-op for an unknown email — no token, no email sent", async () => {
    const { service, authRepository, emailService } = makeService({
      authRepository: { findUserIdByEmail: jest.fn().mockResolvedValue(null) },
    });

    await service.forgotPassword("nobody@example.com");

    expect(authRepository.createVerificationToken).not.toHaveBeenCalled();
    expect(emailService.sendPasswordResetEmail).not.toHaveBeenCalled();
  });

  it("creates a token and sends the reset email for a known address", async () => {
    const { service, authRepository, emailService } = makeService({
      authRepository: {
        findUserIdByEmail: jest.fn().mockResolvedValue({ id: "u1" }),
      },
    });

    await service.forgotPassword("a@b.com");

    expect(authRepository.createVerificationToken).toHaveBeenCalledWith(
      "a@b.com",
      expect.any(String),
      expect.any(Date),
    );
    expect(emailService.sendPasswordResetEmail).toHaveBeenCalledWith(
      "a@b.com",
      expect.any(String),
    );
  });

  // PB06: the stored token is a hash, the emailed one is the raw secret; the
  // link is valid for at most 15 minutes.
  it("stores only a SHA-256 hash of the token and expires it within 15 minutes", async () => {
    const { service, authRepository, emailService } = makeService({
      authRepository: {
        findUserIdByEmail: jest.fn().mockResolvedValue({ id: "u1" }),
      },
    });
    const before = Date.now();

    await service.forgotPassword("a@b.com");

    const [, storedToken, expires] = (
      authRepository.createVerificationToken as jest.Mock
    ).mock.calls[0] as [string, string, Date];
    const [, emailedToken] = (emailService.sendPasswordResetEmail as jest.Mock)
      .mock.calls[0] as [string, string];
    expect(emailedToken).toMatch(/^[0-9a-f]{64}$/);
    expect(storedToken).not.toBe(emailedToken);
    expect(storedToken).toBe(
      crypto.createHash("sha256").update(emailedToken).digest("hex"),
    );
    expect(expires.getTime() - before).toBeLessThanOrEqual(15 * 60 * 1000 + 50);
  });
});

describe("AuthService.resetPassword", () => {
  it("rejects a token that doesn't exist", async () => {
    const { service } = makeService({
      authRepository: {
        findVerificationToken: jest.fn().mockResolvedValue(null),
      },
    });

    await expect(
      service.resetPassword("bad-token", "newpassword123"),
    ).rejects.toBeInstanceOf(BadRequestApiException);
  });

  it("rejects an expired token", async () => {
    const { service, authRepository } = makeService({
      authRepository: {
        findVerificationToken: jest.fn().mockResolvedValue({
          identifier: "a@b.com",
          token: "t1",
          expires: new Date(Date.now() - 1000),
        }),
      },
    });

    await expect(
      service.resetPassword("t1", "newpassword123"),
    ).rejects.toBeInstanceOf(BadRequestApiException);
    expect(authRepository.consumePasswordReset).not.toHaveBeenCalled();
  });

  it("hashes the new password and consumes the token when valid", async () => {
    (bcrypt.hash as jest.Mock).mockResolvedValue("new-hash");
    const { service, authRepository } = makeService({
      authRepository: {
        findVerificationToken: jest.fn().mockResolvedValue({
          identifier: "a@b.com",
          token: "t1",
          expires: new Date(Date.now() + 1000 * 60 * 60),
        }),
      },
    });

    await service.resetPassword("t1", "newpassword123");

    const t1Hash = crypto.createHash("sha256").update("t1").digest("hex");
    expect(authRepository.findVerificationToken).toHaveBeenCalledWith(t1Hash);
    expect(authRepository.consumePasswordReset).toHaveBeenCalledWith(
      "a@b.com",
      t1Hash,
      "new-hash",
    );
  });

  it("rejects when a concurrent request already consumed this token (consumePasswordReset returns false)", async () => {
    const { service } = makeService({
      authRepository: {
        findVerificationToken: jest.fn().mockResolvedValue({
          identifier: "a@b.com",
          token: "t1",
          expires: new Date(Date.now() + 1000 * 60 * 60),
        }),
        consumePasswordReset: jest.fn().mockResolvedValue(false),
      },
    });

    await expect(
      service.resetPassword("t1", "newpassword123"),
    ).rejects.toBeInstanceOf(BadRequestApiException);
  });
});

describe("AuthService.disableTwoFactor", () => {
  it("rejects an incorrect password without disabling 2FA or touching sessions, and records the auth-failure metric", async () => {
    (bcrypt.compare as jest.Mock).mockResolvedValue(false);
    const { service, authRepository, metricsService } = makeService({
      authRepository: {
        findUserById: jest.fn().mockResolvedValue({
          id: "u1",
          passwordHash: "hash",
          twoFactorEnabled: true,
        }),
        disableTwoFactor: jest.fn(),
        revokeAllSessions: jest.fn(),
      },
    });

    await expect(
      service.disableTwoFactor("u1", "wrong-password"),
    ).rejects.toBeInstanceOf(UnauthorizedApiException);
    expect(authRepository.disableTwoFactor).not.toHaveBeenCalled();
    expect(authRepository.revokeAllSessions).not.toHaveBeenCalled();
    expect(metricsService.recordAuthFailure).toHaveBeenCalledWith(
      "2fa_disable_invalid_password",
    );
  });

  it("rejects a social-only account with no password to check", async () => {
    const { service, authRepository } = makeService({
      authRepository: {
        findUserById: jest.fn().mockResolvedValue({
          id: "u1",
          passwordHash: null,
          twoFactorEnabled: true,
        }),
        disableTwoFactor: jest.fn(),
      },
    });

    await expect(
      service.disableTwoFactor("u1", "anything"),
    ).rejects.toBeInstanceOf(BadRequestApiException);
    expect(authRepository.disableTwoFactor).not.toHaveBeenCalled();
  });

  // Idempotency, not an information leak — `userId` is already this
  // caller's own id (from their JWT), so short-circuiting on their own
  // current 2FA state discloses nothing about anyone else's account. Also
  // guards against the session-revocation side effect firing on a no-op.
  it("rejects (without checking the password) when 2FA is already disabled", async () => {
    const { service, authRepository } = makeService({
      authRepository: {
        findUserById: jest.fn().mockResolvedValue({
          id: "u1",
          passwordHash: "hash",
          twoFactorEnabled: false,
        }),
        disableTwoFactor: jest.fn(),
        revokeAllSessions: jest.fn(),
      },
    });

    const error = await service
      .disableTwoFactor("u1", "correct-password")
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(BadRequestApiException);
    expect((error as BadRequestApiException).getResponse()).toMatchObject({
      code: ErrorCode.TWO_FACTOR_NOT_ENABLED,
    });
    expect(authRepository.disableTwoFactor).not.toHaveBeenCalled();
    expect(authRepository.revokeAllSessions).not.toHaveBeenCalled();
  });

  // Disabling 2FA is a real security-posture downgrade — every live
  // session (including this request's own) must be forced back through
  // login afterward, same reasoning as AdminService.updateUser revoking
  // every session on a ban/role change. Without this, someone who
  // obtained the password some other way (credential stuffing, a reused
  // breached password) could disable 2FA and keep a legitimate-looking
  // session running indefinitely.
  it("revokes every session for the user once 2FA is disabled", async () => {
    (bcrypt.compare as jest.Mock).mockResolvedValue(true);
    const { service, authRepository, metricsService } = makeService({
      authRepository: {
        findUserById: jest.fn().mockResolvedValue({
          id: "u1",
          passwordHash: "hash",
          twoFactorEnabled: true,
        }),
        disableTwoFactor: jest.fn().mockResolvedValue(undefined),
        revokeAllSessions: jest.fn().mockResolvedValue(3),
      },
    });

    await service.disableTwoFactor("u1", "correct-password");

    expect(authRepository.disableTwoFactor).toHaveBeenCalledWith("u1");
    expect(authRepository.revokeAllSessions).toHaveBeenCalledWith("u1");
    expect(metricsService.recordAuthFailure).not.toHaveBeenCalled();
  });
});
