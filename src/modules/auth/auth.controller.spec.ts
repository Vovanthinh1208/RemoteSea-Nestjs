import type { Request } from "express";
import { AuthController } from "./auth.controller";
import type { AuthService } from "./auth.service";
import { RateLimitService } from "@/common/services/rate-limit.service";
import type { ConfigService } from "@nestjs/config";
import {
  TooManyRequestsApiException,
  UnauthorizedApiException,
} from "@/common/exceptions/api.exception";
import { ErrorCode } from "@/common/exceptions/error-codes";
import type { LoginDto } from "./dto/login.dto";
import type { AuthenticatedUser } from "@/common/interfaces/authenticated-user.interface";

describe("AuthController.login Rate Limiting (PB02-TC08)", () => {
  let controller: AuthController;
  let authService: Partial<Record<keyof AuthService, jest.Mock>>;
  let rateLimitService: RateLimitService;

  const mockUser: AuthenticatedUser = {
    id: "usr_test_1",
    email: "user@example.com",
    name: "Test User",
    role: "TALENT",
  };

  const validDto: LoginDto = {
    email: "user@example.com",
    password: "correctpassword",
  };

  const invalidDto: LoginDto = {
    email: "user@example.com",
    password: "wrongpassword",
  };

  const mockReq = (ip = "127.0.0.1"): Request =>
    ({
      ip,
      headers: { "user-agent": "test-agent" },
    }) as unknown as Request;

  beforeEach(() => {
    rateLimitService = new RateLimitService();
    authService = {
      loginOrChallenge: jest.fn().mockImplementation((email, password) => {
        if (password === "correctpassword") {
          return Promise.resolve({
            accessToken: "mock.jwt.token",
            user: mockUser,
          });
        }
        throw new UnauthorizedApiException(
          "Invalid email or password",
          ErrorCode.INVALID_CREDENTIALS,
        );
      }),
    };

    controller = new AuthController(
      authService as unknown as AuthService,
      rateLimitService,
      {} as ConfigService<any, true>,
    );
  });

  it("PB02-TC08: allows 10+ consecutive successful logins without blocking (does not count valid logins towards failed rate limit)", async () => {
    const req = mockReq("192.168.1.10");

    // Perform 10 consecutive successful logins
    for (let i = 0; i < 10; i++) {
      const res = await controller.login(req, validDto);
      expect(res).toEqual({
        accessToken: "mock.jwt.token",
        user: mockUser,
      });
    }

    // 11th consecutive successful login MUST succeed and NOT be blocked
    const res11 = await controller.login(req, validDto);
    expect(res11).toEqual({
      accessToken: "mock.jwt.token",
      user: mockUser,
    });
    expect(authService.loginOrChallenge).toHaveBeenCalledTimes(11);
  });

  it("PB02-TC08: blocks the 11th attempt with 429 after 10 consecutive failed logins within 1 minute", async () => {
    const req = mockReq("192.168.1.20");

    // Perform 10 consecutive failed logins
    for (let i = 0; i < 10; i++) {
      await expect(controller.login(req, invalidDto)).rejects.toThrow(
        UnauthorizedApiException,
      );
    }
    expect(authService.loginOrChallenge).toHaveBeenCalledTimes(10);

    // 11th attempt must be temporarily blocked by rate limit
    await expect(controller.login(req, invalidDto)).rejects.toThrow(
      TooManyRequestsApiException,
    );
    // loginOrChallenge should NOT have been called on the 11th attempt
    expect(authService.loginOrChallenge).toHaveBeenCalledTimes(10);
  });

  it("PB02-TC08: a successful login breaks the consecutive failure streak and resets the failure counter", async () => {
    const req = mockReq("192.168.1.30");

    // 5 consecutive failed logins
    for (let i = 0; i < 5; i++) {
      await expect(controller.login(req, invalidDto)).rejects.toThrow(
        UnauthorizedApiException,
      );
    }

    // Successful login occurs
    const successRes = await controller.login(req, validDto);
    expect(successRes).toHaveProperty("accessToken");

    // 5 more failed logins occur
    for (let i = 0; i < 5; i++) {
      await expect(controller.login(req, invalidDto)).rejects.toThrow(
        UnauthorizedApiException,
      );
    }

    // Should still NOT be blocked because counter was reset on success (total 5 consecutive failures, limit is 10)
    await expect(controller.login(req, invalidDto)).rejects.toThrow(
      UnauthorizedApiException,
    );
  });

  it("PB02-TC08: blocks by IP when 10 consecutive failures occur across multiple accounts from the same IP", async () => {
    const req = mockReq("10.0.0.99");

    for (let i = 0; i < 10; i++) {
      const dto: LoginDto = {
        email: `victim${i}@example.com`,
        password: "wrong",
      };
      await expect(controller.login(req, dto)).rejects.toThrow(
        UnauthorizedApiException,
      );
    }

    // 11th attempt from this IP is blocked
    await expect(
      controller.login(req, {
        email: "victim99@example.com",
        password: "wrong",
      }),
    ).rejects.toThrow(TooManyRequestsApiException);
  });

  it("PB02-TC08: blocks by account when 10 consecutive failures occur on the same account across different IPs", async () => {
    for (let i = 0; i < 10; i++) {
      const req = mockReq(`10.0.1.${i + 1}`);
      await expect(controller.login(req, invalidDto)).rejects.toThrow(
        UnauthorizedApiException,
      );
    }

    // 11th attempt on this account from a new IP is blocked
    const newReq = mockReq("10.0.1.200");
    await expect(controller.login(newReq, invalidDto)).rejects.toThrow(
      TooManyRequestsApiException,
    );
  });
});
