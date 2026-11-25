import * as crypto from "crypto";
import type { Request } from "express";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { AuthRepository } from "./auth.repository";
import { EmailService } from "@/common/services/email.service";
import { RateLimitService } from "@/common/services/rate-limit.service";
import { ConfigService } from "@nestjs/config";
import type { EnvConfig } from "@/core/config/env.validation";
import { RESET_TOKEN_TTL_MS, RATE_LIMITS } from "./constants";
import {
  BadRequestApiException,
  TooManyRequestsApiException,
} from "@/common/exceptions/api.exception";
import { ErrorCode } from "@/common/exceptions/error-codes";

describe("PB06: Yêu cầu quên mật khẩu (Password Reset Request)", () => {
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
  // PB06-TC04: Nếu email tồn tại, hệ thống tạo mã token đặt lại mật khẩu có
  // thời hạn (15 phút) và gửi email chứa liên kết an toàn tới người dùng
  // =========================================================================
  describe("PB06-TC04: Token đặt lại mật khẩu có thời hạn chuẩn 15 phút và gửi email liên kết an toàn", () => {
    it("tạo token với thời hạn chính xác là 15 phút (900.000 ms) và gửi email chứa liên kết an toàn", async () => {
      const email = "user@example.com";
      authRepository.findUserIdByEmail = jest
        .fn()
        .mockResolvedValue({ id: "user-1", bannedAt: null });

      const fixedNow = 1700000000000;
      const nowSpy = jest.spyOn(Date, "now").mockReturnValue(fixedNow);

      try {
        await authService.forgotPassword(email);

        // 1. Kiểm tra hằng số TTL chuẩn 15 phút
        expect(RESET_TOKEN_TTL_MS).toBe(15 * 60 * 1000);

        // 2. Kiểm tra token lưu vào repository có expires đúng fixedNow + 15 phút
        expect(authRepository.createVerificationToken).toHaveBeenCalledTimes(1);
        const [savedEmail, savedTokenHash, expiresAt] = (
          authRepository.createVerificationToken as jest.Mock
        ).mock.calls[0] as [string, string, Date];

        expect(savedEmail).toBe(email);
        expect(typeof savedTokenHash).toBe("string");
        expect(expiresAt.getTime()).toBe(fixedNow + 15 * 60 * 1000);

        // 3. Kiểm tra email chứa raw token (khác hash lưu trong DB)
        expect(emailService.sendPasswordResetEmail).toHaveBeenCalledTimes(1);
        const [targetEmail, rawToken] = (
          emailService.sendPasswordResetEmail as jest.Mock
        ).mock.calls[0] as [string, string];
        expect(targetEmail).toBe(email);
        expect(rawToken).toBeDefined();
        expect(rawToken.length).toBe(64); // 32 bytes hex
      } finally {
        nowSpy.mockRestore();
      }
    });

    it("cho phép đổi mật khẩu thành công khi token còn trong hạn 15 phút", async () => {
      const rawToken = "a".repeat(64);
      const tokenHash = crypto
        .createHash("sha256")
        .update(rawToken)
        .digest("hex");

      const unexpiredDate = new Date(Date.now() + 10 * 60 * 1000); // Còn 10 phút hạn

      authRepository.findVerificationToken = jest.fn().mockResolvedValue({
        identifier: "user@example.com",
        token: tokenHash,
        expires: unexpiredDate,
      });

      await expect(
        authService.resetPassword(rawToken, "NewPass@1234"),
      ).resolves.not.toThrow();

      expect(authRepository.consumePasswordReset).toHaveBeenCalledWith(
        "user@example.com",
        tokenHash,
        expect.any(String),
      );
    });

    it("từ chối yêu cầu đổi mật khẩu khi token đã quá hạn 15 phút với mã lỗi INVALID_OR_EXPIRED_TOKEN", async () => {
      const rawToken = "b".repeat(64);
      const tokenHash = crypto
        .createHash("sha256")
        .update(rawToken)
        .digest("hex");

      const expiredDate = new Date(Date.now() - 1000); // Đã quá hạn 1 giây

      authRepository.findVerificationToken = jest.fn().mockResolvedValue({
        identifier: "user@example.com",
        token: tokenHash,
        expires: expiredDate,
      });

      let caughtError: unknown;
      try {
        await authService.resetPassword(rawToken, "NewPass@1234");
      } catch (err) {
        caughtError = err;
      }

      expect(caughtError).toBeInstanceOf(BadRequestApiException);
      const res = (caughtError as BadRequestApiException).getResponse() as {
        code: string;
        error: string;
      };
      expect(res.code).toBe(ErrorCode.INVALID_OR_EXPIRED_TOKEN);
      expect(authRepository.consumePasswordReset).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // PB06-TC06: Giới hạn gửi email tối đa 3 lần trong vòng 15 phút cho cùng một
  // địa chỉ email để chống spam
  // =========================================================================
  describe("PB06-TC06: Giới hạn tối đa 3 lần trong vòng 15 phút cho cùng một địa chỉ email", () => {
    it("cho phép gửi tối đa 3 yêu cầu cho cùng một email, chặn yêu cầu thứ 4 trong vòng 15 phút với mã 429", async () => {
      const req = createMockRequest("192.168.1.100");
      const email = "target@example.com";
      authRepository.findUserIdByEmail = jest
        .fn()
        .mockResolvedValue({ id: "u-1", bannedAt: null });

      const startTime = 1700000000000;
      let currentTime = startTime;
      const nowSpy = jest
        .spyOn(Date, "now")
        .mockImplementation(() => currentTime);

      try {
        // Yêu cầu 1: Thành công
        const res1 = await authController.forgotPassword(req, { email });
        expect(res1).toEqual({
          message: "If that email exists, a reset link was sent.",
        });

        // Yêu cầu 2 (sau 2 phút): Thành công
        currentTime += 2 * 60 * 1000;
        const res2 = await authController.forgotPassword(req, { email });
        expect(res2).toEqual({
          message: "If that email exists, a reset link was sent.",
        });

        // Yêu cầu 3 (sau 4 phút): Thành công
        currentTime += 2 * 60 * 1000;
        const res3 = await authController.forgotPassword(req, { email });
        expect(res3).toEqual({
          message: "If that email exists, a reset link was sent.",
        });

        // Yêu cầu 4 (sau 6 phút - vẫn trong 15 phút): Bị từ chối với 429 Too Many Requests
        currentTime += 2 * 60 * 1000;
        let caughtError: unknown;
        try {
          await authController.forgotPassword(req, { email });
        } catch (err) {
          caughtError = err;
        }

        expect(caughtError).toBeInstanceOf(TooManyRequestsApiException);
        const rateLimitEx = caughtError as TooManyRequestsApiException;
        // retryAfter phải dựa trên cửa sổ 15 phút (~9 phút còn lại = 540s), không phải 60 giây
        expect(rateLimitEx.retryAfter).toBeGreaterThan(60);
        expect(rateLimitEx.retryAfter).toBeLessThanOrEqual(15 * 60);

        // Sau 16 phút (> 15 phút): Cửa sổ đã reset, cho phép gửi lại
        currentTime = startTime + 16 * 60 * 1000;
        const resAfterReset = await authController.forgotPassword(req, {
          email,
        });
        expect(resAfterReset).toEqual({
          message: "If that email exists, a reset link was sent.",
        });
      } finally {
        nowSpy.mockRestore();
      }
    });

    it("giới hạn độc lập theo từng địa chỉ email: email B không bị chặn bởi giới hạn của email A", async () => {
      const req = createMockRequest("192.168.1.100");
      authRepository.findUserIdByEmail = jest
        .fn()
        .mockResolvedValue({ id: "u-1", bannedAt: null });

      // Gửi 3 lần cho email A
      await authController.forgotPassword(req, { email: "a@example.com" });
      await authController.forgotPassword(req, { email: "a@example.com" });
      await authController.forgotPassword(req, { email: "a@example.com" });

      // Lần 4 cho email A bị chặn
      await expect(
        authController.forgotPassword(req, { email: "a@example.com" }),
      ).rejects.toThrow(TooManyRequestsApiException);

      // Email B gửi lần 1 vẫn thành công từ cùng một IP (IP limit = 30 req/min)
      await expect(
        authController.forgotPassword(req, { email: "b@example.com" }),
      ).resolves.toEqual({
        message: "If that email exists, a reset link was sent.",
      });
    });

    it("thiết lập header rateLimitInfo phản ánh đúng giới hạn 3 lần của email", async () => {
      const req = createMockRequest("10.0.0.1");
      authRepository.findUserIdByEmail = jest
        .fn()
        .mockResolvedValue({ id: "u-1", bannedAt: null });

      await authController.forgotPassword(req, { email: "tracked@test.com" });
      expect(req.rateLimitInfo).toEqual({
        limit: 3,
        remaining: 2,
      });

      await authController.forgotPassword(req, { email: "tracked@test.com" });
      expect(req.rateLimitInfo).toEqual({
        limit: 3,
        remaining: 1,
      });

      await authController.forgotPassword(req, { email: "tracked@test.com" });
      expect(req.rateLimitInfo).toEqual({
        limit: 3,
        remaining: 0,
      });
    });
  });

  // =========================================================================
  // PB06-TC07: Token đặt lại mật khẩu phải được mã hóa và có thời hạn tối đa 15 phút
  // =========================================================================
  describe("PB06-TC07: Token được băm bảo vệ trong CSDL và có thời hạn tối đa 15 phút", () => {
    it("chỉ lưu bản băm SHA-256 trong CSDL, không bao giờ lưu token thô", async () => {
      const email = "security@example.com";
      authRepository.findUserIdByEmail = jest
        .fn()
        .mockResolvedValue({ id: "u-sec", bannedAt: null });

      await authService.forgotPassword(email);

      const [, storedToken] = (
        authRepository.createVerificationToken as jest.Mock
      ).mock.calls[0] as [string, string, Date];

      const [, emailedToken] = (
        emailService.sendPasswordResetEmail as jest.Mock
      ).mock.calls[0] as [string, string];

      // Token gửi qua email là chuỗi ngẫu nhiên 64 ký tự hex
      expect(emailedToken).toMatch(/^[0-9a-f]{64}$/);
      // Chuỗi lưu CSDL khác token gửi qua email
      expect(storedToken).not.toBe(emailedToken);
      // Chuỗi lưu CSDL là bản băm SHA-256 của token gửi qua email
      const expectedHash = crypto
        .createHash("sha256")
        .update(emailedToken)
        .digest("hex");
      expect(storedToken).toBe(expectedHash);
    });

    it("đảm bảo token là single-use (chỉ dùng duy nhất một lần)", async () => {
      const rawToken = "c".repeat(64);
      const tokenHash = crypto
        .createHash("sha256")
        .update(rawToken)
        .digest("hex");

      // Giả lập lần 1: token hợp lệ và được tiêu thụ thành công
      authRepository.findVerificationToken = jest.fn().mockResolvedValueOnce({
        identifier: "user@example.com",
        token: tokenHash,
        expires: new Date(Date.now() + 10 * 60 * 1000),
      });
      authRepository.consumePasswordReset = jest
        .fn()
        .mockResolvedValueOnce(true);

      await authService.resetPassword(rawToken, "NewPass@123");
      expect(authRepository.consumePasswordReset).toHaveBeenCalledTimes(1);

      // Giả lập lần 2: token đã bị xóa hoặc consumePasswordReset trả về false (đã dùng)
      authRepository.findVerificationToken = jest
        .fn()
        .mockResolvedValueOnce(null);

      let caughtError: unknown;
      try {
        await authService.resetPassword(rawToken, "NewPass@456");
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
  // PB06-TC08: Kiểm tra quyền truy cập (Access Control & Permissions)
  // =========================================================================
  describe("PB06-TC08: Kiểm tra phân quyền truy cập chức năng Quên mật khẩu", () => {
    it("cho phép khách chưa đăng nhập (unauthenticated/guest) gửi yêu cầu mà không cần accessToken", async () => {
      const req = createMockRequest("203.0.113.1");
      delete req.headers.authorization;

      authRepository.findUserIdByEmail = jest
        .fn()
        .mockResolvedValue({ id: "guest-user", bannedAt: null });

      const response = await authController.forgotPassword(req, {
        email: "guest@example.com",
      });

      expect(response).toEqual({
        message: "If that email exists, a reset link was sent.",
      });
      expect(authRepository.createVerificationToken).toHaveBeenCalled();
      expect(emailService.sendPasswordResetEmail).toHaveBeenCalled();
    });

    it("tài khoản bị khóa/cấm (banned) không được cấp token đặt lại hay gửi email, nhưng vẫn trả thông báo chung chống dò quét", async () => {
      const req = createMockRequest("203.0.113.2");
      const email = "banned@example.com";

      // Tài khoản bị cấm (bannedAt có giá trị ngày tháng)
      authRepository.findUserIdByEmail = jest.fn().mockResolvedValue({
        id: "banned-user-1",
        bannedAt: new Date("2026-01-01"),
      });

      const response = await authController.forgotPassword(req, { email });

      // Vẫn trả thông báo chung (chống enumeration)
      expect(response).toEqual({
        message: "If that email exists, a reset link was sent.",
      });

      // Không tạo token và không gửi email cho tài khoản không đủ điều kiện
      expect(authRepository.createVerificationToken).not.toHaveBeenCalled();
      expect(emailService.sendPasswordResetEmail).not.toHaveBeenCalled();
    });

    it("email không tồn tại không tạo token hay gửi email, và trả thông báo giống hệt email có thật", async () => {
      const req = createMockRequest("203.0.113.3");
      const email = "nonexistent@example.com";

      authRepository.findUserIdByEmail = jest.fn().mockResolvedValue(null);

      const response = await authController.forgotPassword(req, { email });

      expect(response).toEqual({
        message: "If that email exists, a reset link was sent.",
      });
      expect(authRepository.createVerificationToken).not.toHaveBeenCalled();
      expect(emailService.sendPasswordResetEmail).not.toHaveBeenCalled();
    });
  });
});
