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
    // passport-google-oauth20 exposes `verified` on the primary email (from Google's
    // email_verified claim) even though the @types/passport base type omits it —
    // an unverified email must never be used to look up/link a User account.
    const primaryEmail = profile.emails?.[0] as { value?: string; verified?: boolean } | undefined;
    if (!primaryEmail?.value || primaryEmail.verified !== true) {
      done(new Error("Google account has no verified email"), undefined);
      return;
    }
    const email = primaryEmail.value;
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
