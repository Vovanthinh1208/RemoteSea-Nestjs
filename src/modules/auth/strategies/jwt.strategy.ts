import { Injectable } from "@nestjs/common";
import { PassportStrategy } from "@nestjs/passport";
import { ConfigService } from "@nestjs/config";
import { ExtractJwt, Strategy } from "passport-jwt";
import type { EnvConfig } from "@/core/config/env.validation";
import type {
  AuthenticatedUser,
  JwtPayload,
} from "@/common/interfaces/authenticated-user.interface";
import { AuthMapper } from "../auth.mapper";

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, "jwt") {
  constructor(config: ConfigService<EnvConfig, true>) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get("AUTH_SECRET", { infer: true }),
    });
  }

  validate(payload: JwtPayload & { purpose?: string }): AuthenticatedUser {
    // A 2FA challenge token (see AuthService.loginOrChallenge) is signed with
    // this same secret but must never authenticate a real request — only
    // POST /auth/2fa/challenge accepts it, verified there explicitly.
    if (payload.purpose) {
      throw new Error("Invalid token");
    }
    return AuthMapper.fromPayload(payload);
  }
}
