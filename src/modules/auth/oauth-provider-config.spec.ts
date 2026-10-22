import type { ConfigService } from "@nestjs/config";
import type { EnvConfig } from "@/core/config/env.validation";
import { ServiceUnavailableApiException } from "@/common/exceptions/api.exception";
import {
  assertOAuthProviderConfigured,
  getConfiguredOAuthProviders,
} from "./oauth-provider-config";

describe("OAuth provider configuration", () => {
  const configWith = (values: Partial<EnvConfig>) =>
    ({ get: (key: keyof EnvConfig) => values[key] }) as ConfigService<
      EnvConfig,
      true
    >;

  it("lists only providers with a client ID, secret, and callback URL", () => {
    const config = configWith({
      AUTH_GOOGLE_ID: "google-id",
      AUTH_GOOGLE_SECRET: "google-secret",
      AUTH_GOOGLE_CALLBACK_URL: "https://api.example.com/auth/google/callback",
      AUTH_GITHUB_ID: "github-id",
      AUTH_GITHUB_SECRET: "github-secret",
      // Missing callback URL means GitHub cannot complete the OAuth round trip.
      AUTH_LINKEDIN_ID: "linkedin-id",
      AUTH_LINKEDIN_SECRET: "linkedin-secret",
      AUTH_LINKEDIN_CALLBACK_URL:
        "https://api.example.com/auth/linkedin/callback",
    });

    expect(getConfiguredOAuthProviders(config)).toEqual(["google", "linkedin"]);
  });

  it("rejects a provider that is missing any required setting", () => {
    const config = configWith({
      AUTH_GOOGLE_ID: "google-id",
      AUTH_GOOGLE_SECRET: "google-secret",
      // Callback URLs must be explicitly allow-listed at the provider.
    });

    let error: unknown;
    try {
      assertOAuthProviderConfigured(config, "google");
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(ServiceUnavailableApiException);
    expect(
      (error as ServiceUnavailableApiException).getResponse(),
    ).toMatchObject({ error: "Google sign-in is not configured." });
  });

  it("returns no configured providers when credentials are empty", () => {
    const config = configWith({
      AUTH_GOOGLE_ID: "",
      AUTH_GOOGLE_SECRET: "",
      AUTH_GOOGLE_CALLBACK_URL: "",
      AUTH_GITHUB_ID: "",
      AUTH_GITHUB_SECRET: "",
      AUTH_GITHUB_CALLBACK_URL: "",
      AUTH_LINKEDIN_ID: "",
      AUTH_LINKEDIN_SECRET: "",
      AUTH_LINKEDIN_CALLBACK_URL: "",
    });

    expect(getConfiguredOAuthProviders(config)).toEqual([]);
  });
});
