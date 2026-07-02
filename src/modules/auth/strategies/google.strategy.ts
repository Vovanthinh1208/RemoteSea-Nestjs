import { Injectable } from "@nestjs/common";
import { PassportStrategy } from "@nestjs/passport";
import { ConfigService } from "@nestjs/config";
import { Strategy, type Profile, type VerifyCallback } from "passport-google-oauth20";
import type { EnvConfig } from "@/core/config/env.validation";
import type { OAuthProfile } from "../interfaces";

@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, "google") {
  constructor(config: ConfigService<EnvConfig, true>) {
    super({
      clientID: config.get("AUTH_GOOGLE_ID", { infer: true }),
      clientSecret: config.get("AUTH_GOOGLE_SECRET", { infer: true }),
      callbackURL: config.get("AUTH_GOOGLE_CALLBACK_URL", { infer: true }),
      scope: ["email", "profile"],
    });
  }

  validate(
    _accessToken: string,
    _refreshToken: string,
    profile: Profile,
    done: VerifyCallback
  ): void {
    const email = profile.emails?.[0]?.value;
    if (!email) {
      done(new Error("Google account has no email"), undefined);
      return;
    }
    const oauthProfile: OAuthProfile = {
      provider: "google",
      providerAccountId: profile.id,
      email,
      name: profile.displayName ?? null,
      image: profile.photos?.[0]?.value ?? null,
    };
    done(null, oauthProfile);
  }
}
