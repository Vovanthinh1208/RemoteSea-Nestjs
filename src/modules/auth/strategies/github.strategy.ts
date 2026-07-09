import { Injectable } from "@nestjs/common";
import { PassportStrategy } from "@nestjs/passport";
import { ConfigService } from "@nestjs/config";
import { Strategy, type Profile } from "passport-github2";
import type { EnvConfig } from "@/core/config/env.validation";
import type { OAuthProfile } from "../interfaces";
import { normalizeEmail } from "@/common/utils/normalize-email";

type Done = (err: Error | null, user?: OAuthProfile) => void;

@Injectable()
export class GithubStrategy extends PassportStrategy(Strategy, "github") {
  constructor(config: ConfigService<EnvConfig, true>) {
    super({
      clientID: config.get("AUTH_GITHUB_ID", { infer: true }),
      clientSecret: config.get("AUTH_GITHUB_SECRET", { infer: true }),
      callbackURL: config.get("AUTH_GITHUB_CALLBACK_URL", { infer: true }),
      scope: ["user:email"],
      // Without this, passport-github2 only surfaces the account's *primary*
      // email (github.com/user/emails), with no guarantee it's verified — a
      // GitHub user can set an unverified address as primary. Requesting raw
      // emails lets us pick one that is actually verified before using it to
      // look up/link a User account.
      allRawEmails: true,
    });
  }

  validate(
    _accessToken: string,
    _refreshToken: string,
    profile: Profile,
    done: Done,
  ): void {
    const emails = (profile.emails ?? []) as Array<{
      value: string;
      primary?: boolean;
      verified?: boolean;
    }>;
    const verifiedEmail =
      emails.find((e) => e.verified && e.primary) ??
      emails.find((e) => e.verified);

    if (!verifiedEmail) {
      done(new Error("GitHub account has no verified email"));
      return;
    }
    done(null, {
      provider: "github",
      providerAccountId: profile.id,
      email: normalizeEmail(verifiedEmail.value),
      name: profile.displayName ?? profile.username ?? null,
      image: profile.photos?.[0]?.value ?? null,
    });
  }
}
