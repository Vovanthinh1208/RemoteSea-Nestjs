import { Module, type Provider } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { PassportModule } from "@nestjs/passport";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { AuthRepository } from "./auth.repository";
import { JwtStrategy } from "./strategies/jwt.strategy";
import { GoogleStrategy } from "./strategies/google.strategy";
import { GithubStrategy } from "./strategies/github.strategy";
import { LinkedinStrategy } from "./strategies/linkedin.strategy";
import type { EnvConfig } from "@/core/config/env.validation";
import { isOAuthProviderConfigured } from "./oauth-provider-config";

// ConfigModule loads .env during Nest initialization, after static module
// imports have already evaluated. Use factories so each Passport strategy is
// registered from validated runtime config, rather than inspecting
// process.env at import time. Disabled providers return null; their guards
// check availability before asking Passport to resolve a strategy.
const oauthProviders: Provider[] = [
  {
    provide: GoogleStrategy,
    inject: [ConfigService],
    useFactory: (config: ConfigService<EnvConfig, true>) =>
      isOAuthProviderConfigured(config, "google")
        ? new GoogleStrategy(config)
        : null,
  },
  {
    provide: GithubStrategy,
    inject: [ConfigService],
    useFactory: (config: ConfigService<EnvConfig, true>) =>
      isOAuthProviderConfigured(config, "github")
        ? new GithubStrategy(config)
        : null,
  },
  {
    provide: LinkedinStrategy,
    inject: [ConfigService],
    useFactory: (config: ConfigService<EnvConfig, true>) =>
      isOAuthProviderConfigured(config, "linkedin")
        ? new LinkedinStrategy(config)
        : null,
  },
];

@Module({
  imports: [
    ConfigModule,
    PassportModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService<EnvConfig, true>) => ({
        secret: config.get("AUTH_SECRET", { infer: true }),
        signOptions: {
          expiresIn: config.get("JWT_EXPIRES_IN", { infer: true }),
        },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, AuthRepository, JwtStrategy, ...oauthProviders],
  // TalentService needs verifySession to optionally identify the caller of
  // the unauthenticated GET /talent/:slug route (for VERIFIED_EMPLOYERS
  // visibility) — the only other module that reaches into AuthService.
  exports: [AuthService],
})
export class AuthModule {}
