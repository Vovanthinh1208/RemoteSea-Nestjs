import type { ConfigService } from "@nestjs/config";
import type { ExecutionContext } from "@nestjs/common";
import type { EnvConfig } from "@/core/config/env.validation";
import { ErrorCode } from "@/common/exceptions/error-codes";
import { GithubAuthGuard } from "./github-auth.guard";
import { GoogleAuthGuard } from "./google-auth.guard";
import { LinkedinAuthGuard } from "./linkedin-auth.guard";

describe("OAuth guards without provider credentials", () => {
  const context = {} as ExecutionContext;
  const authService = {
    verifyOAuthLinkIntent: jest.fn(),
  } as never;
  const metricsService = { recordAuthFailure: jest.fn() } as never;

  it.each([
    ["Google", GoogleAuthGuard],
    ["GitHub", GithubAuthGuard],
    ["LinkedIn", LinkedinAuthGuard],
  ])("returns a safe 503 when %s credentials are absent", (provider, Guard) => {
    const config = {
      get: jest.fn(() => undefined),
    } as unknown as ConfigService<EnvConfig, true>;
    const guard =
      Guard === GoogleAuthGuard
        ? new GoogleAuthGuard(authService, metricsService, config)
        : Guard === GithubAuthGuard
          ? new GithubAuthGuard(authService, metricsService, config)
          : new LinkedinAuthGuard(authService, config);

    expect(() => guard.canActivate(context)).toThrow(
      expect.objectContaining({
        status: 503,
        response: {
          error: `${provider} sign-in is not configured.`,
          code: ErrorCode.SERVICE_UNAVAILABLE,
        },
      }),
    );
  });
});
