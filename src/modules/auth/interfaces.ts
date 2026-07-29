import type { UserRole } from "@prisma/client";

export interface RegisteredUser {
  id: string;
  email: string;
  name: string | null;
  role: UserRole;
}

export type OAuthProviderName = "google" | "github" | "linkedin";

export interface OAuthProfile {
  provider: OAuthProviderName;
  providerAccountId: string;
  email: string;
  name: string | null;
  image: string | null;
}

// Issued by AuthService.loginOrChallenge instead of a normal access token
// when the account has 2FA enabled — short-lived (5m) and deliberately
// shaped so JwtStrategy.validate rejects it outright (see the `purpose`
// check there): it must never be usable as a Bearer token against any
// other route, only against POST /auth/2fa/challenge.
export interface TwoFactorChallengePayload {
  sub: string;
  purpose: "2fa_challenge";
}

// Carried in the OAuth `state` param for Settings > Connected accounts
// "Connect" (as opposed to sign-in): GET /auth/:provider/link mints one for
// the already-authenticated caller, and the shared callback route decodes it
// to link the resulting profile to that specific userId instead of running
// the normal find-or-create-by-email login flow. Short-lived (10m) and
// rejected by JwtStrategy the same way a 2FA challenge token is (the
// `purpose` claim), so it can never double as a real access token either.
export interface OAuthLinkIntentPayload {
  sub: string;
  provider: OAuthProviderName;
  purpose: "oauth_link";
}
