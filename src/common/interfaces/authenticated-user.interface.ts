import type { UserRole } from "@prisma/client";

export interface AuthenticatedUser {
  id: string;
  email: string;
  name: string | null;
  role: UserRole;
}

export interface JwtPayload {
  sub: string;
  email: string;
  name: string | null;
  role: UserRole;
  // Session row id (see the `Session` Prisma model) — JwtStrategy.validate
  // looks this up on every request to check the session hasn't been revoked.
  // Optional so tokens issued before this existed still decode (JwtStrategy
  // treats a missing sid the same as a revoked session: reject, forcing
  // re-login once rather than crashing on old tokens).
  sid?: string;
}
