import type { User } from "@prisma/client";
import type { AuthenticatedUser, JwtPayload } from "@/common/interfaces/authenticated-user.interface";

export class AuthMapper {
  static toAuthenticatedUser(user: User): AuthenticatedUser {
    return { id: user.id, email: user.email, name: user.name, role: user.role };
  }

  static fromPayload(payload: JwtPayload): AuthenticatedUser {
    return { id: payload.sub, email: payload.email, name: payload.name, role: payload.role };
  }
}
