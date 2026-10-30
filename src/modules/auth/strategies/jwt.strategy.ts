import { Injectable, Logger } from "@nestjs/common";
import { PassportStrategy } from "@nestjs/passport";
import { ConfigService } from "@nestjs/config";
import { ExtractJwt, Strategy } from "passport-jwt";
import type { EnvConfig } from "@/core/config/env.validation";
import type {
  AuthenticatedUser,
  JwtPayload,
} from "@/common/interfaces/authenticated-user.interface";
import { AuthMapper } from "../auth.mapper";
import { AuthRepository } from "../auth.repository";
import { runInBackground } from "@/common/utils/background-task.util";
import { ServiceUnavailableApiException } from "@/common/exceptions/api.exception";

// Only bother writing lastSeenAt when it's gone stale by this much — every
// authenticated request hits this path, so touching it unconditionally would
// mean one DB write per request instead of roughly one per idle period.
const SESSION_TOUCH_THRESHOLD_MS = 5 * 60_000;

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, "jwt") {
  private readonly logger = new Logger(JwtStrategy.name);

  constructor(
    config: ConfigService<EnvConfig, true>,
    private readonly authRepository: AuthRepository,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get("AUTH_SECRET", { infer: true }),
    });
  }

  async validate(
    payload: JwtPayload & { purpose?: string },
  ): Promise<AuthenticatedUser & { sid: string }> {
    // A 2FA challenge token (see AuthService.loginOrChallenge) is signed with
    // this same secret but must never authenticate a real request — only
    // POST /auth/2fa/challenge accepts it, verified there explicitly.
    if (payload.purpose) {
      throw new Error("Invalid token");
    }
    // Settings > Security > Active sessions revocation. Missing sid means a
    // token issued before this existed — treated the same as revoked rather
    // than trusted, forcing a one-time re-login instead of silently skipping
    // the check for old tokens.
    if (!payload.sid) {
      throw new Error("Session expired — please sign in again");
    }
    let session: Awaited<ReturnType<AuthRepository["findSessionState"]>>;
    try {
      session = await this.authRepository.findSessionState(payload.sid);
    } catch (error) {
      // The database couldn't answer (pool timeout, pooler full, network) —
      // that says nothing about the token. Answering 401 here made the web
      // client treat a busy database as an expired session and sign the user
      // out right after logging in; a 503 is retried instead.
      this.logger.error(
        `Session lookup failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw new ServiceUnavailableApiException(
        "We couldn't verify your session right now. Please try again shortly.",
      );
    }
    if (!session || session.revokedAt) {
      throw new Error("Session expired — please sign in again");
    }
    if (
      Date.now() - session.lastSeenAt.getTime() >
      SESSION_TOUCH_THRESHOLD_MS
    ) {
      // Fire-and-forget: this is a "nice to have" recency signal for the
      // sessions list, not something the response should ever wait on or fail
      // over.
      runInBackground(
        this.authRepository.touchSession(session.id),
        this.logger,
        "Failed to update session activity",
      );
    }
    return { ...AuthMapper.fromPayload(payload), sid: payload.sid };
  }
}
