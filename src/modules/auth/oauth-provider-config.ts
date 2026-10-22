import { ConfigService } from "@nestjs/config";
import { ServiceUnavailableApiException } from "@/common/exceptions/api.exception";
import type { EnvConfig } from "@/core/config/env.validation";
import type { OAuthProviderName } from "./interfaces";

const PROVIDER_CONFIG_KEYS = {
  google: ["AUTH_GOOGLE_ID", "AUTH_GOOGLE_SECRET", "AUTH_GOOGLE_CALLBACK_URL"],
  github: ["AUTH_GITHUB_ID", "AUTH_GITHUB_SECRET", "AUTH_GITHUB_CALLBACK_URL"],
  linkedin: [
    "AUTH_LINKEDIN_ID",
    "AUTH_LINKEDIN_SECRET",
    "AUTH_LINKEDIN_CALLBACK_URL",
  ],
} as const;

const PROVIDER_LABELS = {
  google: "Google",
  github: "GitHub",
  linkedin: "LinkedIn",
} as const;

export function isOAuthProviderConfigured(
  config: ConfigService<EnvConfig, true>,
  provider: OAuthProviderName,
): boolean {
  const [clientIdKey, clientSecretKey, callbackUrlKey] =
    PROVIDER_CONFIG_KEYS[provider];
  return Boolean(
    config.get(clientIdKey, { infer: true }) &&
    config.get(clientSecretKey, { infer: true }) &&
    config.get(callbackUrlKey, { infer: true }),
  );
}

export function getConfiguredOAuthProviders(
  config: ConfigService<EnvConfig, true>,
): OAuthProviderName[] {
  return (Object.keys(PROVIDER_CONFIG_KEYS) as OAuthProviderName[]).filter(
    (provider) => isOAuthProviderConfigured(config, provider),
  );
}

export function assertOAuthProviderConfigured(
  config: ConfigService<EnvConfig, true>,
  provider: OAuthProviderName,
): void {
  if (!isOAuthProviderConfigured(config, provider)) {
    throw new ServiceUnavailableApiException(
      `${PROVIDER_LABELS[provider]} sign-in is not configured.`,
    );
  }
}
