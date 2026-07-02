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
}
