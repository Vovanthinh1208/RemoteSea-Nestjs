import * as crypto from "crypto";
import type { Request } from "express";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { AuthRepository } from "./auth.repository";
import { EmailService } from "@/common/services/email.service";
import { RateLimitService } from "@/common/services/rate-limit.service";
import { ConfigService } from "@nestjs/config";
import type { EnvConfig } from "@/core/config/env.validation";
import { RESET_TOKEN_TTL_MS } from "./constants";
import { BadRequestApiException } from "@/common/exceptions/api.exception";
import { ErrorCode } from "@/common/exceptions/error-codes";

describe("PB07: Đặt lại mật khẩu qua email (Password Reset)", () => {
  let authRepository: jest.Mocked<Partial<AuthRepository>>;
  let emailService: jest.Mocked<Partial<EmailService>>;
  let rateLimitService: RateLimitService;
  let authService: AuthService;
  let authController: AuthController;
  let configService: ConfigService<EnvConfig, true>;

  const mockConfig: Record<string, string> = {
    FRONTEND_URL: "https://remotesea.com",
    JWT_SECRET: "mock-jwt-secret-at-least-32-chars-long",
    JWT_EXPIRES_IN: "7d",
  };

  const createMockRequest = (ip = "127.0.0.1"): Request =>
    ({
      ip,
      headers: {},
      socket: { remoteAddress: ip },
    }) as unknown as Request;

  beforeEach(() => {
    authRepository = {
      findUserIdByEmail: jest.fn(),
      findUserByEmail: jest.fn(),
      createVerificationToken: jest.fn().mockResolvedValue(undefined),
      findVerificationToken: jest.fn(),
      consumePasswordReset: jest.fn().mockResolvedValue(true),
    };

    emailService = {
      sendPasswordResetEmail: jest.fn().mockResolvedValue(undefined),
    };

    rateLimitService = new RateLimitService();

    configService = {
      get: jest.fn((key: string) => mockConfig[key]),
    } as unknown as ConfigService<EnvConfig, true>;

    const jwtService = {
      sign: jest.fn().mockReturnValue("mock.token"),
      verify: jest.fn(),
    } as never;

    const metricsService = {
      recordAuthFailure: jest.fn(),
    } as never;

    authService = new AuthService(
      authRepository as unknown as AuthRepository,
      jwtService,
      emailService as unknown as EmailService,
      metricsService,
    );

    authController = new AuthController(
      authService,
      rateLimitService,
      configService,
    );
  });

  // =========================================================================
  // PB07-TC02: Hệ thống kiểm tra tính hợp lệ của token khi mở liên kết
  // =========================================================================
  describe("PB07-TC02: Kiểm tra tính hợp lệ của token khi mở liên kết", () => {
    it("từ chối token sai (không tồn tại trong CSDL) với mã lỗi INVALID_OR_EXPIRED_TOKEN", async () => {
      const req = createMockRequest();
      authRepository.findVerificationToken = jest.fn().mockResolvedValue(null);

      let caughtError: unknown;
      try {
        await authController.verifyResetToken(req, "invalid-random-token-123");
      } catch (err) {
        caughtError = err;
      }

      expect(caughtError).toBeInstanceOf(BadRequestApiException);
      const res = (caughtError as BadRequestApiException).getResponse() as {
        code: string;
        error: string;
      };
      expect(res.code).toBe(ErrorCode.INVALID_OR_EXPIRED_TOKEN);
    });

    it("từ chối khi không truyền token hoặc token rỗng với mã lỗi INVALID_OR_EXPIRED_TOKEN", async () => {
      const req = createMockRequest();

      await expect(
        authController.verifyResetToken(req, undefined),
      ).rejects.toMatchObject({
        response: { code: ErrorCode.INVALID_OR_EXPIRED_TOKEN },
      });

      await expect(
        authController.verifyResetToken(req, "   "),
      ).rejects.toMatchObject({
        response: { code: ErrorCode.INVALID_OR_EXPIRED_TOKEN },
      });
    });
  });

  // =========================================================================
  // PB07-TC03: Nếu token sai hoặc đã hết hạn, hiển thị lỗi và cho phép xin liên kết mới
  // =========================================================================
  describe("PB07-TC03: Từ chối token đã hết hạn (quá 15 phút)", () => {
    it("từ chối token đã quá hạn 15 phút với mã lỗi INVALID_OR_EXPIRED_TOKEN", async () => {
      const req = createMockRequest();
      const rawToken = "expired-token-xyz";
      const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");

      // Token hết hạn 1 phút trước
      authRepository.findVerificationToken = jest.fn().mockResolvedValue({
        identifier: "user@example.com",
        token: tokenHash,
        expires: new Date(Date.now() - 60 * 1000),
      });

      let caughtError: unknown;
      try {
        await authController.verifyResetToken(req, rawToken);
      } catch (err) {
        caughtError = err;
      }

      expect(caughtError).toBeInstanceOf(BadRequestApiException);
      const res = (caughtError as BadRequestApiException).getResponse() as {
        code: string;
        error: string;
      };
      expect(res.code).toBe(ErrorCode.INVALID_OR_EXPIRED_TOKEN);
    });
  });

  // =========================================================================
  // PB07-TC04: Nếu token hợp lệ, cho phép hiển thị form đặt lại mật khẩu mới
  // =========================================================================
  describe("PB07-TC04: Xác nhận token hợp lệ và hiển thị form đặt lại mật khẩu", () => {
    it("trả về { valid: true } khi token hợp lệ và còn trong thời hạn 15 phút", async () => {
      const req = createMockRequest();
      const rawToken = "valid-token-abc";
      const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");

      authRepository.findVerificationToken = jest.fn().mockResolvedValue({
        identifier: "user@example.com",
        token: tokenHash,
        expires: new Date(Date.now() + RESET_TOKEN_TTL_MS),
      });

      const result = await authController.verifyResetToken(req, rawToken);
      expect(result).toEqual({ valid: true });

      // Hỗ trợ cả qua POST body và qua GET reset-password
      const postResult = await authController.verifyResetTokenPost(req, {
        token: rawToken,
      });
      expect(postResult).toEqual({ valid: true });

      const getResetResult = await authController.verifyResetPasswordToken(
        req,
        rawToken,
      );
      expect(getResetResult).toEqual({ valid: true });
    });

    it("cho phép đổi mật khẩu thành công khi token hợp lệ và tiêu thụ token duy nhất một lần", async () => {
      const req = createMockRequest();
      const rawToken = "single-use-token";
      const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");

      authRepository.findVerificationToken = jest.fn().mockResolvedValue({
        identifier: "user@example.com",
        token: tokenHash,
        expires: new Date(Date.now() + RESET_TOKEN_TTL_MS),
      });

      const res = await authController.resetPassword(req, {
        token: rawToken,
        password: "ValidPass123!",
      });

      expect(res).toEqual({ message: "Password updated" });
      expect(authRepository.consumePasswordReset).toHaveBeenCalledWith(
        "user@example.com",
        tokenHash,
        expect.any(String),
      );
    });
  });
});
