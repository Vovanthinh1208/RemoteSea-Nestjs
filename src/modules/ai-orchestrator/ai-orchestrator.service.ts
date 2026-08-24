import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import { CompanyMembershipService } from "@/modules/company/company-membership.service";
import type { EnvConfig } from "@/core/config/env.validation";
import type { AuthenticatedUser } from "@/common/interfaces/authenticated-user.interface";

export interface OrchestratorContextTokenClaims {
  sub: string;
  role: AuthenticatedUser["role"];
  employerId?: string;
  companyRole?: string;
}

// A short-lived (5 min — these tokens are minted per orchestrator request,
// not stored or reused) JWT that tells remotesea-ai exactly who it's acting
// on behalf of, so any Tool it later calls back into this API with can be
// authorized by the same guards (CompanyOwnershipGuard etc.) a direct user
// request would go through — remotesea-ai never re-derives this itself.
// Signed with AI_SERVICE_SECRET (not AUTH_SECRET — a different secret from
// the one that signs this app's own user session tokens), the exact value
// remotesea-ai verifies against (see its require_orchestrator_context).
@Injectable()
export class AiOrchestratorService {
  private readonly logger = new Logger(AiOrchestratorService.name);
  private readonly jwtService = new JwtService();

  constructor(
    private readonly config: ConfigService<EnvConfig, true>,
    private readonly companyMembershipService: CompanyMembershipService,
  ) {}

  private get aiServiceUrl(): string {
    return this.config.get("AI_SERVICE_URL", { infer: true });
  }

  private get aiServiceSecret(): string | undefined {
    return this.config.get("AI_SERVICE_SECRET", { infer: true });
  }

  get isConfigured(): boolean {
    return Boolean(this.aiServiceSecret);
  }

  async mintContextToken(user: AuthenticatedUser): Promise<string> {
    if (!this.aiServiceSecret) {
      throw new Error("AI_SERVICE_SECRET is not configured");
    }

    const membership =
      user.role === "EMPLOYER"
        ? await this.companyMembershipService.resolveMembership(user.id)
        : null;

    const claims: OrchestratorContextTokenClaims = {
      sub: user.id,
      role: user.role,
      ...(membership && {
        employerId: membership.employerId,
        companyRole: membership.role,
      }),
    };

    return this.jwtService.sign(claims, {
      secret: this.aiServiceSecret,
      expiresIn: "5m",
    });
  }

  // api -> ai direction: plain reachability, no auth needed (remotesea-ai's
  // /health is deliberately unauthenticated, same as this app's own).
  async checkAiServiceReachable(): Promise<{
    reachable: boolean;
    latencyMs: number;
    error?: string;
  }> {
    const startedAt = Date.now();
    try {
      const response = await fetch(`${this.aiServiceUrl}/health`, {
        signal: AbortSignal.timeout(5_000),
      });
      if (!response.ok) {
        return {
          reachable: false,
          latencyMs: Date.now() - startedAt,
          error: `HTTP ${response.status}`,
        };
      }
      return { reachable: true, latencyMs: Date.now() - startedAt };
    } catch (error) {
      this.logger.warn(
        `remotesea-ai unreachable: ${error instanceof Error ? error.message : String(error)}`,
      );
      return {
        reachable: false,
        latencyMs: Date.now() - startedAt,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  // ai -> api direction, proven by remotesea-ai calling this app's own
  // /health from inside its handler for GET /v1/orchestrator/health — this
  // method mints the token, calls that endpoint, and hands back whatever it
  // reports about its own round trip back to us.
  async pingOrchestrator(
    user: AuthenticatedUser,
  ): Promise<{ ok: boolean; status?: number; body?: unknown; error?: string }> {
    if (!this.isConfigured) {
      return { ok: false, error: "AI_SERVICE_SECRET is not configured" };
    }
    try {
      const token = await this.mintContextToken(user);
      const response = await fetch(
        `${this.aiServiceUrl}/v1/orchestrator/health`,
        {
          headers: { Authorization: `Bearer ${token}` },
          signal: AbortSignal.timeout(5_000),
        },
      );
      const body = await response.json().catch(() => undefined);
      return { ok: response.ok, status: response.status, body };
    } catch (error) {
      this.logger.warn(
        `Orchestrator round trip failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      return {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}
