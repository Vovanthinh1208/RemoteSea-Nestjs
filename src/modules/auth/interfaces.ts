import type { UserRole } from "@prisma/client";

export interface RegisteredUser {
  id: string;
  email: string;
  name: string | null;
  role: UserRole;
}

export interface OAuthProfile {
  provider: "google" | "github";
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
