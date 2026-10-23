import { Injectable } from "@nestjs/common";
import { PassportStrategy } from "@nestjs/passport";
import { ConfigService } from "@nestjs/config";
import { Strategy } from "passport-oauth2";
import type { EnvConfig } from "@/core/config/env.validation";
import type { OAuthProfile } from "../interfaces";
import { normalizeEmail } from "@/common/utils/normalize-email";

type Done = (err: Error | null, user?: OAuthProfile) => void;

// LinkedIn's userinfo response under "Sign In with LinkedIn using OpenID
// Connect" — standard OIDC claims, not LinkedIn's older v1/v2 REST profile
// shape (which passport-linkedin-oauth2 targets and no longer matches
// LinkedIn's current recommended integration).
interface LinkedInUserInfo {
  sub: string;
  email?: string;
  email_verified?: boolean;
  name?: string;
  picture?: string;
}

const LINKEDIN_USERINFO_URL = "https://api.linkedin.com/v2/userinfo";

@Injectable()
export class LinkedinStrategy extends PassportStrategy(Strategy, "linkedin") {
  constructor(config: ConfigService<EnvConfig, true>) {
    super({
      authorizationURL: "https://www.linkedin.com/oauth/v2/authorization",
      tokenURL: "https://www.linkedin.com/oauth/v2/accessToken",
      clientID: config.get("AUTH_LINKEDIN_ID", { infer: true }),
      clientSecret: config.get("AUTH_LINKEDIN_SECRET", { infer: true }),
      callbackURL: config.get("AUTH_LINKEDIN_CALLBACK_URL", { infer: true }),
      scope: ["openid", "profile", "email"],
    });
    // node-oauth's get() sends the token as ?access_token= unless told
    // otherwise; LinkedIn's /v2/userinfo only accepts a Bearer header and
    // answers 401, which failed every LinkedIn sign-in/connect with
    // AUTHENTICATION_REQUIRED. (passport-github2 sets this itself.)
    this._oauth2.useAuthorizationHeaderforGET(true);
  }

  // passport-oauth2's default userProfile() assumes a REST profile endpoint
  // with its own response shape — LinkedIn's OIDC userinfo endpoint needs
  // this override instead (same idea as passport-google-oauth20's built-in
  // one, just not built into the generic oauth2 strategy).
  override userProfile(
    accessToken: string,
    done: (err?: unknown, profile?: unknown) => void,
  ): void {
    this._oauth2.get(LINKEDIN_USERINFO_URL, accessToken, (err, body) => {
      if (err || !body) {
        done(new Error("Failed to fetch LinkedIn profile"));
        return;
      }
      try {
        done(null, JSON.parse(body.toString()) as LinkedInUserInfo);
      } catch {
        done(new Error("Failed to parse LinkedIn profile"));
      }
    });
  }

  validate(
    _accessToken: string,
    _refreshToken: string,
    profile: LinkedInUserInfo,
    done: Done,
  ): void {
    if (!profile.email || profile.email_verified !== true) {
      done(new Error("LinkedIn account has no verified email"));
      return;
    }
    done(null, {
      provider: "linkedin",
      providerAccountId: profile.sub,
      email: normalizeEmail(profile.email),
      name: profile.name ?? null,
      image: profile.picture ?? null,
    });
  }
}
