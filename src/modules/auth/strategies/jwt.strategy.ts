import { Injectable } from "@nestjs/common";
import { PassportStrategy } from "@nestjs/passport";
import { ConfigService } from "@nestjs/config";
import { ExtractJwt, Strategy } from "passport-jwt";
import type { EnvConfig } from "@/core/config/env.validation";
import type { AuthenticatedUser, JwtPayload } from "@/common/interfaces/authenticated-user.interface";
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

  validate(payload: JwtPayload): AuthenticatedUser {
    return AuthMapper.fromPayload(payload);
  }
}
