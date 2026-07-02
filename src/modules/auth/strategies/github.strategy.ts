import { Injectable } from "@nestjs/common";
import { PassportStrategy } from "@nestjs/passport";
import { ConfigService } from "@nestjs/config";
import { Strategy, type Profile } from "passport-github2";
import type { EnvConfig } from "@/core/config/env.validation";
import type { OAuthProfile } from "../interfaces";

type Done = (err: Error | null, user?: OAuthProfile) => void;

@Injectable()
export class GithubStrategy extends PassportStrategy(Strategy, "github") {
  constructor(config: ConfigService<EnvConfig, true>) {
    super({
      clientID: config.get("AUTH_GITHUB_ID", { infer: true }),
      clientSecret: config.get("AUTH_GITHUB_SECRET", { infer: true }),
      callbackURL: config.get("AUTH_GITHUB_CALLBACK_URL", { infer: true }),
      scope: ["user:email"],
    });
  }

  validate(_accessToken: string, _refreshToken: string, profile: Profile, done: Done): void {
    const email = profile.emails?.[0]?.value;
    if (!email) {
      done(new Error("GitHub account has no public email"));
      return;
    }
    done(null, {
      provider: "github",
      providerAccountId: profile.id,
      email,
      name: profile.displayName ?? profile.username ?? null,
      image: profile.photos?.[0]?.value ?? null,
    });
  }
}
