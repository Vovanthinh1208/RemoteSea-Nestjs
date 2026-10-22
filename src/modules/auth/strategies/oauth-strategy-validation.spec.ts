import type { ConfigService } from "@nestjs/config";
import type { EnvConfig } from "@/core/config/env.validation";
import { GithubStrategy } from "./github.strategy";
import { GoogleStrategy } from "./google.strategy";
import { LinkedinStrategy } from "./linkedin.strategy";

const config = {
  get: (key: string) =>
    ({
      AUTH_GOOGLE_ID: "google-id",
      AUTH_GOOGLE_SECRET: "google-secret",
      AUTH_GOOGLE_CALLBACK_URL: "http://localhost:4000/auth/google/callback",
      AUTH_GITHUB_ID: "github-id",
      AUTH_GITHUB_SECRET: "github-secret",
      AUTH_GITHUB_CALLBACK_URL: "http://localhost:4000/auth/github/callback",
      AUTH_LINKEDIN_ID: "linkedin-id",
      AUTH_LINKEDIN_SECRET: "linkedin-secret",
      AUTH_LINKEDIN_CALLBACK_URL:
        "http://localhost:4000/auth/linkedin/callback",
    })[key],
} as unknown as ConfigService<EnvConfig, true>;

describe("OAuth profile validation", () => {
  it("accepts Google's verified email and normalizes its address", () => {
    const strategy = new GoogleStrategy(config);
    const done = jest.fn();
    strategy.validate(
      "access-token",
      "refresh-token",
      {
        id: "google-subject",
        displayName: "Person",
        emails: [{ value: " PERSON@EXAMPLE.COM ", verified: true }],
        photos: [],
      } as never,
      done,
    );

    expect(done).toHaveBeenCalledWith(
      null,
      expect.objectContaining({
        provider: "google",
        providerAccountId: "google-subject",
        email: "person@example.com",
      }),
    );
  });

  it("rejects an unverified Google email", () => {
    const done = jest.fn();
    new GoogleStrategy(config).validate(
      "access-token",
      "refresh-token",
      {
        id: "google-subject",
        emails: [{ value: "person@example.com", verified: false }],
      } as never,
      done,
    );
    expect(done.mock.calls[0][0]).toEqual(
      expect.objectContaining({
        message: "Google account has no verified email",
      }),
    );
  });

  it("uses a verified GitHub email and rejects profiles with none", () => {
    const strategy = new GithubStrategy(config);
    const success = jest.fn();
    strategy.validate(
      "access-token",
      "refresh-token",
      {
        id: "github-subject",
        username: "person",
        emails: [
          { value: "unverified@example.com", primary: true, verified: false },
          { value: " PERSON@EXAMPLE.COM ", verified: true },
        ],
      } as never,
      success,
    );
    expect(success).toHaveBeenCalledWith(
      null,
      expect.objectContaining({
        email: "person@example.com",
        provider: "github",
      }),
    );

    const failure = jest.fn();
    strategy.validate(
      "a",
      "r",
      { id: "github-subject", emails: [] } as never,
      failure,
    );
    expect(failure.mock.calls[0][0]).toEqual(
      expect.objectContaining({
        message: "GitHub account has no verified email",
      }),
    );
  });

  it("requires a verified LinkedIn OIDC email", () => {
    const strategy = new LinkedinStrategy(config);
    const success = jest.fn();
    strategy.validate(
      "a",
      "r",
      {
        sub: "linkedin-subject",
        email: " PERSON@EXAMPLE.COM ",
        email_verified: true,
        name: "Person",
      },
      success,
    );
    expect(success).toHaveBeenCalledWith(
      null,
      expect.objectContaining({
        email: "person@example.com",
        provider: "linkedin",
      }),
    );

    const failure = jest.fn();
    strategy.validate(
      "a",
      "r",
      {
        sub: "linkedin-subject",
        email: "person@example.com",
        email_verified: false,
      },
      failure,
    );
    expect(failure.mock.calls[0][0]).toEqual(
      expect.objectContaining({
        message: "LinkedIn account has no verified email",
      }),
    );
  });
});
