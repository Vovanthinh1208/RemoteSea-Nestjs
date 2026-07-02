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
import type { EnvConfig } from "@/core/config/env.validation";

// Google/GitHub sign-in degrades gracefully when unconfigured, mirroring
// env.ts treating these as optional integrations — only register the
// strategy (and therefore the route) when credentials are present.
const oauthProviders: Provider[] = [
  ...(process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET ? [GoogleStrategy] : []),
  ...(process.env.AUTH_GITHUB_ID && process.env.AUTH_GITHUB_SECRET ? [GithubStrategy] : []),
];

@Module({
  imports: [
    PassportModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService<EnvConfig, true>) => ({
        secret: config.get("AUTH_SECRET", { infer: true }),
        signOptions: { expiresIn: config.get("JWT_EXPIRES_IN", { infer: true }) },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, AuthRepository, JwtStrategy, ...oauthProviders],
  exports: [AuthService],
})
export class AuthModule {}
