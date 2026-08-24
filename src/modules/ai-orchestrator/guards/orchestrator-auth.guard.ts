import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import type { Request } from "express";
import { UnauthorizedApiException } from "@/common/exceptions/api.exception";
import { ErrorCode } from "@/common/exceptions/error-codes";
import type { AuthenticatedUser } from "@/common/interfaces/authenticated-user.interface";
import type { EnvConfig } from "@/core/config/env.validation";
import type { OrchestratorContextTokenClaims } from "../ai-orchestrator.service";

/**
 * Populates request.user for a Tool call arriving from remotesea-ai, the
 * same shape JwtAuthGuard populates it for a direct browser request — every
 * downstream guard (RolesGuard, ApplicationAccessGuard, ...) reads only
 * request.user.id/.role, so they enforce exactly the same authorization
 * here as they would for the real user, unmodified.
 *
 * Verifies the token remotesea-ai forwards is one *this app itself* minted
 * (AiOrchestratorService.mintContextToken, signed with AI_SERVICE_SECRET —
 * a different secret than AUTH_SECRET, which signs real user sessions).
 * This is deliberately not JwtAuthGuard/JwtStrategy: that path requires a
 * `sid` resolving to a live Session row, which an orchestrator token has no
 * reason to carry — it's a short-lived, single-purpose credential, not a
 * session.
 */
@Injectable()
export class OrchestratorAuthGuard implements CanActivate {
  private readonly jwtService = new JwtService();

  constructor(private readonly config: ConfigService<EnvConfig, true>) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context
      .switchToHttp()
      .getRequest<Request & { user: AuthenticatedUser }>();
    const authorization = request.headers.authorization;
    if (!authorization?.startsWith("Bearer ")) {
      throw new UnauthorizedApiException(
        "Missing orchestrator context token",
        ErrorCode.AUTHENTICATION_REQUIRED,
      );
    }

    const secret = this.config.get("AI_SERVICE_SECRET", { infer: true });
    if (!secret) {
      throw new UnauthorizedApiException(
        "AI_SERVICE_SECRET is not configured",
        ErrorCode.AUTHENTICATION_REQUIRED,
      );
    }

    const token = authorization.slice("Bearer ".length);
    let claims: OrchestratorContextTokenClaims;
    try {
      claims = this.jwtService.verify<OrchestratorContextTokenClaims>(token, {
        secret,
      });
    } catch {
      throw new UnauthorizedApiException(
        "Invalid or expired orchestrator context token",
        ErrorCode.INVALID_OR_EXPIRED_TOKEN,
      );
    }

    // Deliberately minimal — nothing downstream reads email/name off a
    // tool-originated request.user, only id and role.
    request.user = {
      id: claims.sub,
      role: claims.role,
      email: "",
      name: null,
    };
    return true;
  }
}
