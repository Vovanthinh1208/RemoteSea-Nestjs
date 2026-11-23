import { ConfigService } from "@nestjs/config";
import type { EnvConfig } from "@/core/config/env.validation";
import { GoogleStrategy } from "./strategies/google.strategy";
import { GithubStrategy } from "./strategies/github.strategy";
import { LinkedinStrategy } from "./strategies/linkedin.strategy";
import { GoogleAuthGuard } from "./guards/google-auth.guard";
import { GithubAuthGuard } from "./guards/github-auth.guard";
import { LinkedinAuthGuard } from "./guards/linkedin-auth.guard";
import { AuthRepository } from "./auth.repository";
import { AuthService } from "./auth.service";
import { AuthController } from "./auth.controller";
import type { PrismaService } from "@/core/database/prisma.service";
import type { OAuthProfile } from "./interfaces";
import { ErrorCode } from "@/common/exceptions/error-codes";
import {
  UnauthorizedApiException,
  ServiceUnavailableApiException,
  ForbiddenApiException,
  ConflictApiException,
} from "@/common/exceptions/api.exception";
import type { Request, Response } from "express";

describe("PB04: Đăng nhập bằng Google, GitHub hoặc LinkedIn (OAuth)", () => {
  const mockConfigData: Record<string, string> = {
    AUTH_GOOGLE_ID: "google-client-id-123",
    AUTH_GOOGLE_SECRET: "google-client-secret-xyz",
    AUTH_GOOGLE_CALLBACK_URL: "https://remotesea.com/api/auth/google/callback",
    AUTH_GITHUB_ID: "github-client-id-456",
    AUTH_GITHUB_SECRET: "github-client-secret-xyz",
    AUTH_GITHUB_CALLBACK_URL: "https://remotesea.com/api/auth/github/callback",
    AUTH_LINKEDIN_ID: "linkedin-client-id-789",
    AUTH_LINKEDIN_SECRET: "linkedin-client-secret-xyz",
    AUTH_LINKEDIN_CALLBACK_URL: "https://remotesea.com/api/auth/linkedin/callback",
    FRONTEND_URL: "https://remotesea.com",
    JWT_SECRET: "mock-jwt-secret-at-least-32-chars-long",
    JWT_EXPIRES_IN: "7d",
  };

  const createMockConfig = (overrides?: Partial<Record<string, string>>) =>
    ({
      get: jest.fn((key: string) => overrides?.[key] ?? mockConfigData[key]),
    }) as unknown as ConfigService<EnvConfig, true>;

  // =========================================================================
  // PB04-TC02: Hệ thống chuyển hướng người dùng đến trang xác thực của nhà cung cấp OAuth tương ứng
  // =========================================================================
  describe("PB04-TC02: Hệ thống chuyển hướng người dùng đến trang xác thực OAuth tương ứng", () => {
    it("chuyển hướng người dùng đến trang xác thực chính xác của Google, GitHub, LinkedIn với đầy đủ client_id và redirect_uri", () => {
      const config = createMockConfig();
      const authService = {
        createOAuthLinkIntent: jest.fn().mockReturnValue("mock-link-state-token"),
        verifyOAuthLinkIntent: jest.fn(),
      } as unknown as AuthService;
      const rateLimitService = { enforce: jest.fn() } as never;
      const controller = new AuthController(authService, rateLimitService, config);

      // 1. Kiểm tra URL Google
      const googleLink = controller.linkProvider({ id: "user-1", email: "u1@test.com", role: "TALENT" } as never, "google");
      expect(googleLink.url).toContain("https://accounts.google.com/o/oauth2/v2/auth");
      expect(googleLink.url).toContain("client_id=google-client-id-123");
      expect(googleLink.url).toContain("redirect_uri=https%3A%2F%2Fremotesea.com%2Fapi%2Fauth%2Fgoogle%2Fcallback");
      expect(googleLink.url).toContain("scope=email+profile");

      // 2. Kiểm tra URL GitHub
      const githubLink = controller.linkProvider({ id: "user-1", email: "u1@test.com", role: "TALENT" } as never, "github");
      expect(githubLink.url).toContain("https://github.com/login/oauth/authorize");
      expect(githubLink.url).toContain("client_id=github-client-id-456");
      expect(githubLink.url).toContain("redirect_uri=https%3A%2F%2Fremotesea.com%2Fapi%2Fauth%2Fgithub%2Fcallback");
      expect(githubLink.url).toContain("scope=user%3Aemail");

      // 3. Kiểm tra URL LinkedIn
      const linkedinLink = controller.linkProvider({ id: "user-1", email: "u1@test.com", role: "TALENT" } as never, "linkedin");
      expect(linkedinLink.url).toContain("https://www.linkedin.com/oauth/v2/authorization");
      expect(linkedinLink.url).toContain("client_id=linkedin-client-id-789");
      expect(linkedinLink.url).toContain("redirect_uri=https%3A%2F%2Fremotesea.com%2Fapi%2Fauth%2Flinkedin%2Fcallback");
      expect(linkedinLink.url).toContain("scope=openid+profile+email");
    });

    it("chặn an toàn với mã 503 Service Unavailable nếu nhà cung cấp chưa được cấu hình ENV (không để crash 500)", () => {
      const emptyConfig = {
        get: jest.fn(() => undefined),
      } as unknown as ConfigService<EnvConfig, true>;
      const authService = { verifyOAuthLinkIntent: jest.fn() } as never;
      const metricsService = { recordAuthFailure: jest.fn() } as never;

      const googleGuard = new GoogleAuthGuard(authService, metricsService, emptyConfig);
      const githubGuard = new GithubAuthGuard(authService, metricsService, emptyConfig);
      const linkedinGuard = new LinkedinAuthGuard(authService, emptyConfig);

      expect(() => googleGuard.canActivate({} as never)).toThrow(ServiceUnavailableApiException);
      expect(() => githubGuard.canActivate({} as never)).toThrow(ServiceUnavailableApiException);
      expect(() => linkedinGuard.canActivate({} as never)).toThrow(ServiceUnavailableApiException);
    });
  });

  // =========================================================================
  // PB04-TC03: Người dùng đăng nhập và chấp thuận cấp quyền chia sẻ thông tin cơ bản (email, họ tên, avatar)
  // =========================================================================
  describe("PB04-TC03: Tiếp nhận và kiểm tra thông tin cơ bản (email, họ tên, avatar) từ OAuth Provider", () => {
    it("Google: trích xuất email đã xác minh, họ tên, avatar và chuẩn hóa chữ thường", () => {
      const config = createMockConfig();
      const strategy = new GoogleStrategy(config);
      const done = jest.fn();

      strategy.validate(
        "mock-access-token",
        "mock-refresh-token",
        {
          id: "google-uid-001",
          displayName: "Nguyễn Văn A",
          emails: [{ value: " NGUYEN.VAN.A@GMAIL.COM ", verified: true }],
          photos: [{ value: "https://lh3.googleusercontent.com/avatar.jpg" }],
        } as never,
        done,
      );

      expect(done).toHaveBeenCalledWith(null, {
        provider: "google",
        providerAccountId: "google-uid-001",
        email: "nguyen.van.a@gmail.com",
        name: "Nguyễn Văn A",
        image: "https://lh3.googleusercontent.com/avatar.jpg",
      });
    });

    it("GitHub: ưu tiên email đã xác minh, trích xuất username/name và avatar", () => {
      const config = createMockConfig();
      const strategy = new GithubStrategy(config);
      const done = jest.fn();

      strategy.validate(
        "mock-access-token",
        "mock-refresh-token",
        {
          id: "github-uid-002",
          displayName: "Lê Thị B",
          username: "lethib",
          emails: [
            { value: "unverified@example.com", primary: true, verified: false },
            { value: " LE.THI.B@GITHUB.COM ", primary: false, verified: true },
          ],
          photos: [{ value: "https://avatars.githubusercontent.com/u/12345" }],
        } as never,
        done,
      );

      expect(done).toHaveBeenCalledWith(null, {
        provider: "github",
        providerAccountId: "github-uid-002",
        email: "le.thi.b@github.com",
        name: "Lê Thị B",
        image: "https://avatars.githubusercontent.com/u/12345",
      });
    });

    it("LinkedIn: trích xuất thông tin OIDC (sub, email_verified, name, picture)", () => {
      const config = createMockConfig();
      const strategy = new LinkedinStrategy(config);
      const done = jest.fn();

      strategy.validate(
        "mock-access-token",
        "mock-refresh-token",
        {
          sub: "linkedin-uid-003",
          email: " TRAN.VAN.C@LINKEDIN.COM ",
          email_verified: true,
          name: "Trần Văn C",
          picture: "https://media.licdn.com/dms/image/avatar.jpg",
        },
        done,
      );

      expect(done).toHaveBeenCalledWith(null, {
        provider: "linkedin",
        providerAccountId: "linkedin-uid-003",
        email: "tran.van.c@linkedin.com",
        name: "Trần Văn C",
        image: "https://media.licdn.com/dms/image/avatar.jpg",
      });
    });

    it("từ chối đăng nhập nếu tài khoản nhà cung cấp chưa xác minh email (bảo vệ chống chiếm quyền)", () => {
      const config = createMockConfig();
      const doneGoogle = jest.fn();
      new GoogleStrategy(config).validate("a", "r", { id: "g1", emails: [{ value: "bad@gmail.com", verified: false }] } as never, doneGoogle);
      expect(doneGoogle.mock.calls[0][0].message).toBe("Google account has no verified email");

      const doneGithub = jest.fn();
      new GithubStrategy(config).validate("a", "r", { id: "gh1", emails: [{ value: "bad@gh.com", verified: false }] } as never, doneGithub);
      expect(doneGithub.mock.calls[0][0].message).toBe("GitHub account has no verified email");

      const doneLinkedin = jest.fn();
      new LinkedinStrategy(config).validate("a", "r", { sub: "in1", email: "bad@in.com", email_verified: false }, doneLinkedin);
      expect(doneLinkedin.mock.calls[0][0].message).toBe("LinkedIn account has no verified email");
    });
  });

  // =========================================================================
  // PB04-TC04: Nhà cung cấp trả mã ủy quyền (OAuth Callback) về hệ thống RemoteSEA
  // =========================================================================
  describe("PB04-TC04: Xử lý OAuth Callback và cơ chế đổi mã ủy quyền (OAuth Exchange)", () => {
    it("Callback tạo mã trao đổi tạm thời (short-lived code) và chuyển hướng an toàn về trang /auth/callback", async () => {
      const config = createMockConfig();
      const mockUser = {
        id: "user-123",
        email: "test@example.com",
        role: "TALENT",
        emailVerified: true,
      };

      const signMock = jest.fn().mockReturnValue("mock-single-use-jwt-code");
      const jwtService = { sign: signMock, verify: jest.fn() };
      const authService = new AuthService(
        { findOrCreateOAuthUser: jest.fn().mockResolvedValue(mockUser) } as never,
        jwtService as never,
        {} as never,
        { recordAuthFailure: jest.fn() } as never,
      );

      const redirectMock = jest.fn();
      const res = { redirect: redirectMock } as unknown as Response;
      const req = {
        user: { provider: "google", providerAccountId: "g1", email: "test@example.com", name: "Test", image: null },
        query: {},
      } as unknown as Request;

      const controller = new AuthController(authService, { enforce: jest.fn() } as never, config);
      await controller.googleCallback(req, res);

      // Mã trao đổi được sinh với purpose: 'oauth_exchange' và thời hạn 60s
      expect(signMock).toHaveBeenCalledWith(
        { sub: "user-123", purpose: "oauth_exchange" },
        { expiresIn: "60s" },
      );
      // Chuyển hướng người dùng về frontend callback kèm mã code ngắn hạn
      expect(redirectMock).toHaveBeenCalledWith(
        "https://remotesea.com/auth/callback?code=mock-single-use-jwt-code",
      );
    });

    it("đổi thành công mã trao đổi hợp lệ lấy Access Token và thông tin phiên đăng nhập", async () => {
      const mockUser = {
        id: "user-123",
        email: "test@example.com",
        name: "Test User",
        image: null,
        role: "TALENT",
        bannedAt: null,
      };
      const verifyMock = jest.fn().mockReturnValue({ sub: "user-123", purpose: "oauth_exchange" });
      const signMock = jest.fn().mockReturnValue("real.access.jwt.token");
      const jwtService = { sign: signMock, verify: verifyMock };
      const authRepository = {
        findUserById: jest.fn().mockResolvedValue(mockUser),
        createSession: jest.fn().mockResolvedValue({ id: "session-1" }),
      };

      const authService = new AuthService(
        authRepository as never,
        jwtService as never,
        {} as never,
        { recordAuthFailure: jest.fn() } as never,
      );
      const result = await authService.completeOAuthExchange("mock-valid-code");

      expect(verifyMock).toHaveBeenCalledWith("mock-valid-code");
      expect(result.accessToken).toBe("real.access.jwt.token");
      expect(result.user).toMatchObject({
        id: "user-123",
        email: "test@example.com",
        role: "TALENT",
      });
    });

    it("từ chối mã trao đổi giả mạo, hết hạn hoặc sai mục đích với mã lỗi 401 INVALID_OAUTH_EXCHANGE_CODE", async () => {
      const verifyMock = jest.fn().mockImplementation(() => {
        throw new Error("Token expired");
      });
      const authService = new AuthService(
        {} as never,
        { verify: verifyMock } as never,
        {} as never,
        { recordAuthFailure: jest.fn() } as never,
      );

      await expect(authService.completeOAuthExchange("expired-or-bad-code")).rejects.toMatchObject({
        response: {
          code: ErrorCode.INVALID_OAUTH_EXCHANGE_CODE,
        },
      });
    });
  });

  // =========================================================================
  // PB04-TC05: Nếu email đã tồn tại và đã liên kết với nhà cung cấp này, hệ thống tự động đăng nhập người dùng
  // =========================================================================
  describe("PB04-TC05: Tự động đăng nhập nếu tài khoản đã tồn tại và đã liên kết", () => {
    it("tìm thấy bản ghi Account của provider -> trả về ngay người dùng hiện tại mà không tạo User hoặc Account mới", async () => {
      const linkedUser = {
        id: "existing-user-id",
        email: "user@example.com",
        name: "Existing User",
        image: "https://example.com/avatar.jpg",
        role: "TALENT",
        emailVerified: true,
      };

      const findUniqueAccountMock = jest.fn().mockResolvedValue({
        id: "account-row-1",
        userId: linkedUser.id,
        provider: "google",
        providerAccountId: "google-uid-already-linked",
        user: linkedUser,
      });

      const userUpsertMock = jest.fn();
      const accountUpsertMock = jest.fn();

      const prisma = {
        account: { findUnique: findUniqueAccountMock },
        $transaction: jest.fn(),
      } as unknown as PrismaService;

      const repository = new AuthRepository(prisma);
      const user = await repository.findOrCreateOAuthUser({
        provider: "google",
        providerAccountId: "google-uid-already-linked",
        email: "user@example.com",
        name: "Existing User",
        image: "https://example.com/avatar.jpg",
      });

      // Kiểm tra Account tìm kiếm theo cặp [provider, providerAccountId]
      expect(findUniqueAccountMock).toHaveBeenCalledWith({
        where: {
          provider_providerAccountId: {
            provider: "google",
            providerAccountId: "google-uid-already-linked",
          },
        },
        include: { user: true },
      });

      // Trả về đúng user cũ
      expect(user.id).toBe("existing-user-id");
      expect(user.email).toBe("user@example.com");

      // Tuyệt đối không gọi transaction tạo mới bản ghi trùng lặp
      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(userUpsertMock).not.toHaveBeenCalled();
      expect(accountUpsertMock).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // PB04-TC06: Nếu email đã tồn tại nhưng chưa liên kết, hệ thống tự động liên kết nếu email đã xác minh
  // =========================================================================
  describe("PB04-TC06: Tự động liên kết tài khoản OAuth nếu email đã tồn tại và được bên thứ ba xác minh", () => {
    it("email đã tồn tại (đăng ký bằng mật khẩu), tài khoản OAuth mới có email verified -> tự liên kết Account vào User cũ", async () => {
      const existingUser = {
        id: "existing-local-user-id",
        email: "existing@example.com",
        name: "Local Account User",
        role: "EMPLOYER",
        emailVerified: false,
      };

      const updatedUser = {
        ...existingUser,
        emailVerified: true,
      };

      // 1. Chưa có bản ghi liên kết cho provider này
      const findUniqueAccountMock = jest.fn().mockResolvedValue(null);
      const userUpsertMock = jest.fn().mockResolvedValue(updatedUser);
      const accountUpsertMock = jest.fn().mockResolvedValue({
        id: "new-account-id",
        userId: existingUser.id,
        provider: "github",
        providerAccountId: "github-uid-new",
      });

      const prisma = {
        account: { findUnique: findUniqueAccountMock },
        $transaction: (cb: (tx: unknown) => unknown) =>
          cb({
            user: { upsert: userUpsertMock },
            account: { upsert: accountUpsertMock },
          }),
      } as unknown as PrismaService;

      const repository = new AuthRepository(prisma);
      const user = await repository.findOrCreateOAuthUser({
        provider: "github",
        providerAccountId: "github-uid-new",
        email: "existing@example.com",
        name: "Github Name",
        image: null,
      });

      // Kiểm tra user được tìm thấy và cập nhật emailVerified = true (do provider đã xác thực)
      expect(userUpsertMock).toHaveBeenCalledWith({
        where: { email: "existing@example.com" },
        create: {
          email: "existing@example.com",
          name: "Github Name",
          image: null,
          emailVerified: true,
        },
        update: { emailVerified: true },
      });

      // Tạo liên kết Account gắn vào userId cũ (không tạo thêm user mới)
      expect(accountUpsertMock).toHaveBeenCalledWith({
        where: {
          provider_providerAccountId: {
            provider: "github",
            providerAccountId: "github-uid-new",
          },
        },
        create: {
          userId: existingUser.id,
          type: "oauth",
          provider: "github",
          providerAccountId: "github-uid-new",
        },
        update: {},
      });

      expect(user.id).toBe(existingUser.id);
      expect(user.email).toBe("existing@example.com");
    });
  });

  // =========================================================================
  // PB04-TC07: Nếu email chưa tồn tại, hệ thống tự động khởi tạo tài khoản mới với vai trò mặc định TALENT
  // =========================================================================
  describe("PB04-TC07: Tự động khởi tạo tài khoản mới với vai trò mặc định TALENT", () => {
    it("tạo mới bản ghi User với emailVerified=true và vai trò mặc định TALENT, kèm bản ghi liên kết Account", async () => {
      const newUser = {
        id: "fresh-new-user-id",
        email: "newuser@example.com",
        name: "Newbie Talent",
        image: "https://photos.google.com/p1.jpg",
        role: "TALENT", // Vai trò mặc định theo Schema Prisma
        emailVerified: true,
      };

      const findUniqueAccountMock = jest.fn().mockResolvedValue(null);
      const userUpsertMock = jest.fn().mockResolvedValue(newUser);
      const accountUpsertMock = jest.fn().mockResolvedValue({
        id: "account-fresh-id",
        userId: newUser.id,
        provider: "google",
        providerAccountId: "google-uid-fresh",
      });

      const prisma = {
        account: { findUnique: findUniqueAccountMock },
        $transaction: (cb: (tx: unknown) => unknown) =>
          cb({
            user: { upsert: userUpsertMock },
            account: { upsert: accountUpsertMock },
          }),
      } as unknown as PrismaService;

      const repository = new AuthRepository(prisma);
      const user = await repository.findOrCreateOAuthUser({
        provider: "google",
        providerAccountId: "google-uid-fresh",
        email: "newuser@example.com",
        name: "Newbie Talent",
        image: "https://photos.google.com/p1.jpg",
      });

      expect(userUpsertMock).toHaveBeenCalledWith({
        where: { email: "newuser@example.com" },
        create: {
          email: "newuser@example.com",
          name: "Newbie Talent",
          image: "https://photos.google.com/p1.jpg",
          emailVerified: true,
        },
        update: { emailVerified: true },
      });

      expect(accountUpsertMock).toHaveBeenCalledWith({
        where: {
          provider_providerAccountId: {
            provider: "google",
            providerAccountId: "google-uid-fresh",
          },
        },
        create: {
          userId: newUser.id,
          type: "oauth",
          provider: "google",
          providerAccountId: "google-uid-fresh",
        },
        update: {},
      });

      expect(user.id).toBe("fresh-new-user-id");
      expect(user.role).toBe("TALENT");
      expect(user.emailVerified).toBe(true);
    });
  });

  // =========================================================================
  // PB04-TC010: Kiểm tra quyền truy cập (Access Control & Security Constraints)
  // =========================================================================
  describe("PB04-TC010: Kiểm tra quyền truy cập & ràng buộc bảo mật khi Đăng nhập OAuth", () => {
    it("1. Chặn đăng nhập/tự liên kết nếu email của nhà cung cấp chưa được xác minh (Unverified Email)", () => {
      const config = createMockConfig();
      const doneGoogle = jest.fn();
      new GoogleStrategy(config).validate(
        "token",
        "refresh",
        {
          id: "attacker-google-id",
          emails: [{ value: "victim@example.com", verified: false }],
        } as never,
        doneGoogle,
      );
      expect(doneGoogle.mock.calls[0][0]).toBeInstanceOf(Error);
      expect(doneGoogle.mock.calls[0][0].message).toBe("Google account has no verified email");

      const doneGithub = jest.fn();
      new GithubStrategy(config).validate(
        "token",
        "refresh",
        {
          id: "attacker-github-id",
          emails: [{ value: "victim@example.com", primary: true, verified: false }],
        } as never,
        doneGithub,
      );
      expect(doneGithub.mock.calls[0][0]).toBeInstanceOf(Error);
      expect(doneGithub.mock.calls[0][0].message).toBe("GitHub account has no verified email");

      const doneLinkedin = jest.fn();
      new LinkedinStrategy(config).validate(
        "token",
        "refresh",
        {
          sub: "attacker-linkedin-id",
          email: "victim@example.com",
          email_verified: false,
        },
        doneLinkedin,
      );
      expect(doneLinkedin.mock.calls[0][0]).toBeInstanceOf(Error);
      expect(doneLinkedin.mock.calls[0][0].message).toBe("LinkedIn account has no verified email");
    });

    it("2. Chặn đăng nhập OAuth nếu tài khoản đã bị cấm (Banned User: bannedAt !== null) với mã lỗi 403 ACCOUNT_BANNED", async () => {
      const bannedUser = {
        id: "banned-user-id",
        email: "banned@example.com",
        name: "Banned User",
        image: null,
        role: "TALENT",
        emailVerified: true,
        bannedAt: new Date("2026-01-01"),
      };

      const authRepository = {
        findOrCreateOAuthUser: jest.fn().mockResolvedValue(bannedUser),
        findUserById: jest.fn().mockResolvedValue(bannedUser),
      };

      const jwtService = {
        sign: jest.fn().mockReturnValue("mock-token"),
        verify: jest.fn().mockReturnValue({ sub: "banned-user-id", purpose: "oauth_exchange" }),
      };

      const authService = new AuthService(
        authRepository as never,
        jwtService as never,
        {} as never,
        { recordAuthFailure: jest.fn() } as never,
      );

      // Thử validateOAuthLogin với tài khoản bị cấm
      await expect(
        authService.validateOAuthLogin({
          provider: "google",
          providerAccountId: "google-banned-uid",
          email: "banned@example.com",
          name: "Banned User",
          image: null,
        }),
      ).rejects.toMatchObject({
        response: {
          code: ErrorCode.ACCOUNT_BANNED,
        },
      });

      // Thử completeOAuthExchange với tài khoản bị cấm
      await expect(
        authService.completeOAuthExchange("banned-exchange-code"),
      ).rejects.toMatchObject({
        response: {
          code: ErrorCode.ACCOUNT_BANNED,
        },
      });
    });

    it("3. Chặn liên kết tài khoản OAuth nếu tài khoản mạng xã hội đó đã thuộc về một người dùng khác (409 CONNECTION_ALREADY_LINKED)", async () => {
      const authRepository = {
        findAccountByProvider: jest.fn().mockResolvedValue({
          userId: "another-user-id",
          provider: "google",
          providerAccountId: "google-stolen-id",
        }),
        createOAuthConnection: jest.fn(),
      };

      const authService = new AuthService(
        authRepository as never,
        {} as never,
        {} as never,
        { recordAuthFailure: jest.fn() } as never,
      );

      await expect(
        authService.linkOAuthAccount("my-user-id", {
          provider: "google",
          providerAccountId: "google-stolen-id",
          email: "victim@example.com",
          name: "Victim",
          image: null,
        }),
      ).rejects.toMatchObject({
        response: {
          code: ErrorCode.CONNECTION_ALREADY_LINKED,
        },
      });

      expect(authRepository.createOAuthConnection).not.toHaveBeenCalled();
    });

    it("4. Chặn đổi token nếu mã trao đổi có purpose sai (ví dụ 2fa_challenge token) thay vì oauth_exchange", async () => {
      const jwtService = {
        verify: jest.fn().mockReturnValue({
          sub: "user-1",
          purpose: "2fa_challenge", // Sai purpose
        }),
      };

      const authService = new AuthService(
        {} as never,
        jwtService as never,
        {} as never,
        { recordAuthFailure: jest.fn() } as never,
      );

      await expect(
        authService.completeOAuthExchange("forged-or-wrong-purpose-token"),
      ).rejects.toMatchObject({
        response: {
          code: ErrorCode.INVALID_OAUTH_EXCHANGE_CODE,
        },
      });
    });
  });
});
