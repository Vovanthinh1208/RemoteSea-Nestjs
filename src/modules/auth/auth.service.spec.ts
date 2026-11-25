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
  jwtService?: { sign: jest.Mock; verify: jest.Mock };
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
    findSessionProfile: jest.fn(),
    findOrCreateOAuthUser: jest.fn(),
    createVerificationToken: jest.fn(),
    findVerificationToken: jest.fn(),
    consumePasswordReset: jest.fn().mockResolvedValue(true),
    consumeBackupCode: jest.fn().mockResolvedValue(true),
    ...overrides?.authRepository,
  };
  const emailService = {
    sendWelcomeEmail: jest.fn().mockResolvedValue(undefined),
    sendPasswordResetEmail: jest.fn().mockResolvedValue(undefined),
    sendTwoFactorDisabledEmail: jest.fn().mockResolvedValue(undefined),
    ...overrides?.emailService,
  };
  const jwtService: { sign: jest.Mock; verify: jest.Mock } =
    overrides?.jwtService ?? {
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

describe("AuthService.getSessionProfile", () => {
  it("returns the PB08 profile fields without database secrets", async () => {
    const { service } = makeService({
      authRepository: {
        findSessionProfile: jest.fn().mockResolvedValue({
          id: "u1",
          email: "user@example.test",
          name: "Test User",
          role: "TALENT",
          image: "https://cdn.example.test/avatar.png",
        }),
      },
    });

    await expect(service.getSessionProfile("u1")).resolves.toEqual({
      id: "u1",
      email: "user@example.test",
      name: "Test User",
      role: "TALENT",
      permissions: ["TALENT"],
      avatar: "https://cdn.example.test/avatar.png",
    });
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

  it("treats an access token whose session disappeared after account deletion as anonymous", async () => {
    const verify = jest.fn().mockReturnValue({
      sub: "deleted-user",
      email: "a@b.com",
      name: "A",
      role: "TALENT",
      sid: "deleted-session",
    });
    const findSessionState = jest.fn().mockResolvedValue(null);
    const { service } = makeService({
      jwtService: { sign: jest.fn(), verify },
      authRepository: { findSessionState },
    });

    await expect(
      service.verifySession("Bearer old.access.token"),
    ).resolves.toBeNull();
    expect(findSessionState).toHaveBeenCalledWith("deleted-session");
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

describe("AuthService OAuth account linking", () => {
  const profile = {
    provider: "google" as const,
    providerAccountId: "google-subject",
    email: "person@example.com",
    name: "Person",
    image: null,
  };

  it("creates a provider connection for the authenticated account", async () => {
    const createOAuthConnection = jest.fn().mockResolvedValue(undefined);
    const { service } = makeService({
      authRepository: {
        findAccountByProvider: jest.fn().mockResolvedValue(null),
        createOAuthConnection,
      },
    });

    await service.linkOAuthAccount("user-1", profile);

    expect(createOAuthConnection).toHaveBeenCalledWith("user-1", profile);
  });

  it("does not let a provider account already owned by another user be linked", async () => {
    const createOAuthConnection = jest.fn();
    const { service } = makeService({
      authRepository: {
        findAccountByProvider: jest
          .fn()
          .mockResolvedValue({ userId: "user-2" }),
        createOAuthConnection,
      },
    });

    await expect(
      service.linkOAuthAccount("user-1", profile),
    ).rejects.toMatchObject({
      response: {
        code: ErrorCode.CONNECTION_ALREADY_LINKED,
      },
    });
    expect(createOAuthConnection).not.toHaveBeenCalled();
  });

  it("treats an already-linked provider on the same account as a no-op", async () => {
    const createOAuthConnection = jest.fn();
    const { service } = makeService({
      authRepository: {
        findAccountByProvider: jest
          .fn()
          .mockResolvedValue({ userId: "user-1" }),
        createOAuthConnection,
      },
    });

    await service.linkOAuthAccount("user-1", profile);
    expect(createOAuthConnection).not.toHaveBeenCalled();
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
    const nowSpy = jest.spyOn(Date, "now").mockReturnValue(before);

    try {
      await service.forgotPassword("a@b.com");

      const [, storedToken, expires] = (
        authRepository.createVerificationToken as jest.Mock
      ).mock.calls[0] as [string, string, Date];
      const [, emailedToken] = (
        emailService.sendPasswordResetEmail as jest.Mock
      ).mock.calls[0] as [string, string];
      expect(emailedToken).toMatch(/^[0-9a-f]{64}$/);
      expect(storedToken).not.toBe(emailedToken);
      expect(storedToken).toBe(
        crypto.createHash("sha256").update(emailedToken).digest("hex"),
      );
      expect(expires.getTime()).toBe(before + 15 * 60 * 1000);
    } finally {
      nowSpy.mockRestore();
    }
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

    // 400 CURRENT_PASSWORD_INCORRECT, not 401: a 401 signs the web client out.
    const error = await service
      .disableTwoFactor("u1", "wrong-password")
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(BadRequestApiException);
    expect((error as BadRequestApiException).getResponse()).toMatchObject({
      code: ErrorCode.CURRENT_PASSWORD_INCORRECT,
    });
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
    const { service, authRepository, emailService, metricsService } =
      makeService({
        authRepository: {
          findUserById: jest.fn().mockResolvedValue({
            id: "u1",
            email: "user@example.test",
            name: "Test User",
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
    expect(emailService.sendTwoFactorDisabledEmail).toHaveBeenCalledWith(
      "user@example.test",
      "Test User",
    );
    expect(metricsService.recordAuthFailure).not.toHaveBeenCalled();
  });
});

describe("AuthService.completeTwoFactorChallenge", () => {
  const challengeToken = "valid.2fa.challenge.token";
  const mockChallengePayload = {
    sub: "u1",
    purpose: "2fa_challenge",
  };
  const mockUserWith2FA = {
    id: "u1",
    email: "user@example.test",
    name: "Test User",
    role: "TALENT",
    twoFactorEnabled: true,
    twoFactorSecret: "JBSWY3DPEHPK3PXP",
    twoFactorBackupCodes: ["$2b$10$hashedCode1", "$2b$10$hashedCode2"],
  };

  it("rejects invalid or expired challenge token", async () => {
    const { service, jwtService } = makeService();
    jwtService.verify.mockImplementation(() => {
      throw new Error("jwt expired");
    });

    await expect(
      service.completeTwoFactorChallenge("expired.token", "123456"),
    ).rejects.toBeInstanceOf(UnauthorizedApiException);
  });

  it("rejects token with unexpected purpose", async () => {
    const { service, jwtService } = makeService();
    jwtService.verify.mockReturnValue({ sub: "u1", purpose: "login" });

    await expect(
      service.completeTwoFactorChallenge(challengeToken, "123456"),
    ).rejects.toBeInstanceOf(UnauthorizedApiException);
  });

  it("rejects when 2FA is not enabled for the user", async () => {
    const { service, jwtService, authRepository } = makeService({
      authRepository: {
        findUserById: jest.fn().mockResolvedValue({
          id: "u1",
          twoFactorEnabled: false,
          twoFactorSecret: null,
        }),
      },
    });
    jwtService.verify.mockReturnValue(mockChallengePayload);

    await expect(
      service.completeTwoFactorChallenge(challengeToken, "123456"),
    ).rejects.toBeInstanceOf(UnauthorizedApiException);
  });

  it("authenticates and atomically consumes backup code when a valid backup code is provided", async () => {
    (bcrypt.compare as jest.Mock).mockImplementation(
      async (plain: string, hash: string) => {
        return plain === "ABCDE-FGHIJ" && hash === "$2b$10$hashedCode1";
      },
    );
    const { service, jwtService, authRepository } = makeService({
      authRepository: {
        findUserById: jest.fn().mockResolvedValue(mockUserWith2FA),
        consumeBackupCode: jest.fn().mockResolvedValue(true),
      },
    });
    jwtService.verify.mockReturnValue(mockChallengePayload);

    const result = await service.completeTwoFactorChallenge(
      challengeToken,
      "abcde-fghij",
    );

    expect(authRepository.consumeBackupCode).toHaveBeenCalledWith(
      "u1",
      "$2b$10$hashedCode1",
    );
    expect(result).toHaveProperty("accessToken");
    expect(result.user).toEqual({
      id: "u1",
      email: "user@example.test",
      name: "Test User",
      role: "TALENT",
    });
  });

  it("rejects with INVALID_TWO_FACTOR_CODE when backup code does not match any stored hash", async () => {
    (bcrypt.compare as jest.Mock).mockResolvedValue(false);
    const { service, jwtService, authRepository } = makeService({
      authRepository: {
        findUserById: jest.fn().mockResolvedValue(mockUserWith2FA),
        consumeBackupCode: jest.fn(),
      },
    });
    jwtService.verify.mockReturnValue(mockChallengePayload);

    const error = await service
      .completeTwoFactorChallenge(challengeToken, "WRONG-CODE")
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(BadRequestApiException);
    expect((error as BadRequestApiException).getResponse()).toMatchObject({
      code: ErrorCode.INVALID_TWO_FACTOR_CODE,
    });
    expect(authRepository.consumeBackupCode).not.toHaveBeenCalled();
  });

  it("rejects with INVALID_TWO_FACTOR_CODE when consumeBackupCode returns false (already consumed / race condition)", async () => {
    (bcrypt.compare as jest.Mock).mockImplementation(
      async (plain: string, hash: string) => {
        return plain === "ABCDE-FGHIJ" && hash === "$2b$10$hashedCode1";
      },
    );
    const { service, jwtService, authRepository } = makeService({
      authRepository: {
        findUserById: jest.fn().mockResolvedValue(mockUserWith2FA),
        consumeBackupCode: jest.fn().mockResolvedValue(false),
      },
    });
    jwtService.verify.mockReturnValue(mockChallengePayload);

    const error = await service
      .completeTwoFactorChallenge(challengeToken, "ABCDE-FGHIJ")
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(BadRequestApiException);
    expect((error as BadRequestApiException).getResponse()).toMatchObject({
      code: ErrorCode.INVALID_TWO_FACTOR_CODE,
    });
    expect(authRepository.consumeBackupCode).toHaveBeenCalledWith(
      "u1",
      "$2b$10$hashedCode1",
    );
  });

  // PB03-TC09: Mỗi Backup code chỉ được phép sử dụng duy nhất 1 lần (Single-use).
  // Khi gửi đồng thời hai yêu cầu dùng cùng một backup code, chỉ một yêu cầu được chấp nhận.
  it("PB03-TC09: guarantees single-use under concurrent requests with the same backup code", async () => {
    (bcrypt.compare as jest.Mock).mockImplementation(
      async (plain: string, hash: string) => {
        return plain === "SINGLE-USE-CODE" && hash === "$2b$10$hashedCode1";
      },
    );

    let consumedCount = 0;
    const consumeBackupCode = jest.fn().mockImplementation(async () => {
      consumedCount++;
      return consumedCount === 1; // Only the first atomic update succeeds
    });

    const { service, jwtService } = makeService({
      authRepository: {
        findUserById: jest.fn().mockResolvedValue(mockUserWith2FA),
        consumeBackupCode,
      },
    });
    jwtService.verify.mockReturnValue(mockChallengePayload);

    const [req1, req2] = await Promise.allSettled([
      service.completeTwoFactorChallenge(challengeToken, "SINGLE-USE-CODE"),
      service.completeTwoFactorChallenge(challengeToken, "SINGLE-USE-CODE"),
    ]);

    expect(consumeBackupCode).toHaveBeenCalledTimes(2);

    // Exactly one succeeds
    const fulfilled = [req1, req2].filter((r) => r.status === "fulfilled");
    const rejected = [req1, req2].filter((r) => r.status === "rejected");

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);

    const failureReason = (rejected[0] as PromiseRejectedResult).reason;
    expect(failureReason).toBeInstanceOf(BadRequestApiException);
    expect(
      (failureReason as BadRequestApiException).getResponse(),
    ).toMatchObject({
      code: ErrorCode.INVALID_TWO_FACTOR_CODE,
    });
  });

  // PB03-TC010: Giới hạn tối đa 5 lần thử nhập sai mã xác thực trước khi hủy phiên challenge.
  // Sau 5 lần nhập sai, phiên challenge bị hủy; lần thứ 6 nhập đúng mã vẫn bị từ chối.
  it("PB03-TC010: cancels challenge session after 5 failed attempts — 6th attempt with valid code is rejected", async () => {
    (bcrypt.compare as jest.Mock).mockImplementation(
      async (plain: string, hash: string) => {
        return plain === "VALID-CODE" && hash === "$2b$10$hashedCode1";
      },
    );

    const { service, jwtService } = makeService({
      authRepository: {
        findUserById: jest.fn().mockResolvedValue(mockUserWith2FA),
        consumeBackupCode: jest.fn().mockResolvedValue(true),
      },
    });
    jwtService.verify.mockReturnValue(mockChallengePayload);

    // 5 failed attempts with invalid code
    for (let i = 1; i <= 5; i++) {
      const err = await service
        .completeTwoFactorChallenge(challengeToken, "WRONG-CODE")
        .catch((e: unknown) => e);
      expect(err).toBeInstanceOf(BadRequestApiException);
      expect((err as BadRequestApiException).getResponse()).toMatchObject({
        code: ErrorCode.INVALID_TWO_FACTOR_CODE,
      });
    }

    // 6th attempt with valid code must be rejected because challenge session is cancelled
    const sixthAttempt = await service
      .completeTwoFactorChallenge(challengeToken, "VALID-CODE")
      .catch((e: unknown) => e);

    expect(sixthAttempt).toBeInstanceOf(UnauthorizedApiException);
    expect(
      (sixthAttempt as UnauthorizedApiException).getResponse(),
    ).toMatchObject({
      code: ErrorCode.INVALID_CHALLENGE_TOKEN,
    });

    // A fresh challenge token (from a new login step 1) has its own budget and succeeds
    const freshChallengeToken = "fresh.challenge.token";
    const result = await service.completeTwoFactorChallenge(
      freshChallengeToken,
      "VALID-CODE",
    );
    expect(result).toHaveProperty("accessToken");
    expect(result.user.id).toBe("u1");
  });

  it("PB03-TC010: allows successful completion on attempt 5 after 4 failed attempts", async () => {
    (bcrypt.compare as jest.Mock).mockImplementation(
      async (plain: string, hash: string) => {
        return plain === "VALID-CODE" && hash === "$2b$10$hashedCode1";
      },
    );

    const { service, jwtService } = makeService({
      authRepository: {
        findUserById: jest.fn().mockResolvedValue(mockUserWith2FA),
        consumeBackupCode: jest.fn().mockResolvedValue(true),
      },
    });
    jwtService.verify.mockReturnValue(mockChallengePayload);

    // 4 failed attempts
    for (let i = 1; i <= 4; i++) {
      const err = await service
        .completeTwoFactorChallenge(challengeToken, "WRONG-CODE")
        .catch((e: unknown) => e);
      expect(err).toBeInstanceOf(BadRequestApiException);
    }

    // 5th attempt with valid code succeeds
    const successResult = await service.completeTwoFactorChallenge(
      challengeToken,
      "VALID-CODE",
    );
    expect(successResult).toHaveProperty("accessToken");
    expect(successResult.user.id).toBe("u1");
  });

  // User workflow:
  // Phiên 1: Email + Password -> Nhập sai OTP 5 lần -> Challenge bị hủy
  // Phiên 2: Email + Password -> Tạo Challenge mới -> Nhập Backup Code hợp lệ -> Đăng nhập thành công
  // Phiên 3: Đăng xuất -> Email + Password -> Tạo Challenge mới -> Nhập OTP hợp lệ -> Đăng nhập thành công
  it("PB03-TC010: executes the full 3-session workflow (cancelled challenge -> backup code login -> OTP login)", async () => {
    const { generateSecret, generate: generateOtp } = await import("otplib");
    const secret = generateSecret();
    const validOtp = await generateOtp({ secret });

    const userWithTotpAndBackup = {
      id: "u1",
      email: "user@example.test",
      name: "Test User",
      role: "TALENT",
      twoFactorEnabled: true,
      twoFactorSecret: secret,
      twoFactorBackupCodes: ["$2b$10$hashedBackupCode1"],
    };

    (bcrypt.compare as jest.Mock).mockImplementation(
      async (plain: string, hash: string) => {
        return plain === "VALID-BACKUP" && hash === "$2b$10$hashedBackupCode1";
      },
    );

    const { service, jwtService } = makeService({
      authRepository: {
        findUserById: jest.fn().mockResolvedValue(userWithTotpAndBackup),
        consumeBackupCode: jest.fn().mockResolvedValue(true),
      },
    });

    // ─── PHIÊN 1 ─────────────────────────────────────────────────────────────
    // 1. User validates credentials -> receives challengeToken 1
    const challenge1 = "challenge.session.1";
    jwtService.verify.mockImplementation((t: string) => {
      if (t === challenge1) return { sub: "u1", purpose: "2fa_challenge" };
      if (t === "challenge.session.2")
        return { sub: "u1", purpose: "2fa_challenge" };
      if (t === "challenge.session.3")
        return { sub: "u1", purpose: "2fa_challenge" };
      throw new Error("Invalid token");
    });

    // 2. User enters wrong OTP 5 times
    for (let attempt = 1; attempt <= 5; attempt++) {
      const err = await service
        .completeTwoFactorChallenge(challenge1, "000000")
        .catch((e: unknown) => e);
      expect(err).toBeInstanceOf(BadRequestApiException);
      expect((err as BadRequestApiException).getResponse()).toMatchObject({
        code: ErrorCode.INVALID_TWO_FACTOR_CODE,
      });
    }

    // 3. Challenge 1 is now cancelled — 6th attempt (even with valid OTP) is rejected
    const sixthAttempt = await service
      .completeTwoFactorChallenge(challenge1, validOtp)
      .catch((e: unknown) => e);
    expect(sixthAttempt).toBeInstanceOf(UnauthorizedApiException);
    expect(
      (sixthAttempt as UnauthorizedApiException).getResponse(),
    ).toMatchObject({
      code: ErrorCode.INVALID_CHALLENGE_TOKEN,
    });

    // ─── PHIÊN 2 ─────────────────────────────────────────────────────────────
    // 1. User logs in again (Email + Password) -> receives challengeToken 2
    const challenge2 = "challenge.session.2";

    // 2. User enters valid Backup Code -> Login succeeds!
    const session2Result = await service.completeTwoFactorChallenge(
      challenge2,
      "VALID-BACKUP",
    );
    expect(session2Result).toHaveProperty("accessToken");
    expect(session2Result.user).toMatchObject({
      id: "u1",
      email: "user@example.test",
    });

    // ─── PHIÊN 3 ─────────────────────────────────────────────────────────────
    // 1. User logs out, then logs in again (Email + Password) -> receives challengeToken 3
    const challenge3 = "challenge.session.3";

    // 2. User enters valid OTP -> Login succeeds!
    const session3Result = await service.completeTwoFactorChallenge(
      challenge3,
      validOtp,
    );
    expect(session3Result).toHaveProperty("accessToken");
    expect(session3Result.user).toMatchObject({
      id: "u1",
      email: "user@example.test",
    });
  });
});
