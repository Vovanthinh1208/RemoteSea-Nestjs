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
