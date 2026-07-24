import * as bcrypt from "bcrypt";
import { Prisma } from "@prisma/client";
import { AuthService } from "./auth.service";
import type { AuthRepository } from "./auth.repository";
import type { EmailService } from "@/common/services/email.service";
import {
  BadRequestApiException,
  ConflictApiException,
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
}) => {
  const authRepository = {
    findUserByEmail: jest.fn(),
    createUser: jest.fn(),
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

  const service = new AuthService(
    authRepository as unknown as AuthRepository,
    jwtService as never,
    emailService as unknown as EmailService,
  );
  return { service, authRepository, emailService, jwtService };
};

describe("AuthService.register", () => {
  it("rejects a duplicate email", async () => {
    const { service, authRepository } = makeService({
      authRepository: {
        findUserByEmail: jest
          .fn()
          .mockResolvedValue({ id: "u1", email: "a@b.com" }),
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
        findUserByEmail: jest.fn().mockResolvedValue(null),
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
        findUserByEmail: jest.fn().mockResolvedValue(null),
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
        findUserByEmail: jest.fn().mockResolvedValue(null),
        createUser: jest.fn().mockResolvedValue(registered),
      },
    });

    const result = await service.register({
      name: "A",
      email: "a@b.com",
      password: "password123",
      role: "TALENT",
    });

    expect(result).toEqual(registered);
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
});

describe("AuthService.issueToken", () => {
  it("signs a JWT payload derived from the authenticated user", () => {
    const { service, jwtService } = makeService();

    const result = service.issueToken({
      id: "u1",
      email: "a@b.com",
      name: "A",
      role: "TALENT",
    });

    expect(jwtService.sign).toHaveBeenCalledWith({
      sub: "u1",
      email: "a@b.com",
      name: "A",
      role: "TALENT",
    });
    expect(result).toEqual({ accessToken: "signed.jwt.token" });
  });
});

describe("AuthService.verifySession", () => {
  it("returns null when there's no Authorization header", () => {
    const { service } = makeService();
    expect(service.verifySession(undefined)).toBeNull();
  });

  it("returns null for a non-Bearer Authorization header", () => {
    const { service } = makeService();
    expect(service.verifySession("Basic abc123")).toBeNull();
  });

  it("returns null (not a throw) for an invalid/expired token", () => {
    const verify = jest.fn().mockImplementation(() => {
      throw new Error("jwt expired");
    });
    const { service } = makeService({
      jwtService: { sign: jest.fn(), verify },
    });

    expect(service.verifySession("Bearer bad.token")).toBeNull();
  });

  it("maps a valid token's payload to an AuthenticatedUser", () => {
    const verify = jest.fn().mockReturnValue({
      sub: "u1",
      email: "a@b.com",
      name: "A",
      role: "TALENT",
    });
    const { service } = makeService({
      jwtService: { sign: jest.fn(), verify },
    });

    const result = service.verifySession("Bearer good.token");

    expect(verify).toHaveBeenCalledWith("good.token");
    expect(result).toEqual({
      id: "u1",
      email: "a@b.com",
      name: "A",
      role: "TALENT",
    });
  });
});

describe("AuthService.forgotPassword", () => {
  it("is a no-op for an unknown email — no token, no email sent", async () => {
    const { service, authRepository, emailService } = makeService({
      authRepository: { findUserByEmail: jest.fn().mockResolvedValue(null) },
    });

    await service.forgotPassword("nobody@example.com");

    expect(authRepository.createVerificationToken).not.toHaveBeenCalled();
    expect(emailService.sendPasswordResetEmail).not.toHaveBeenCalled();
  });

  it("creates a token and sends the reset email for a known address", async () => {
    const { service, authRepository, emailService } = makeService({
      authRepository: {
        findUserByEmail: jest
          .fn()
          .mockResolvedValue({ id: "u1", email: "a@b.com" }),
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

    expect(authRepository.consumePasswordReset).toHaveBeenCalledWith(
      "a@b.com",
      "t1",
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
