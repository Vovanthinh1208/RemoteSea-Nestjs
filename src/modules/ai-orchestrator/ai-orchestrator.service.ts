import {
  HttpException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import { CompanyMembershipService } from "@/modules/company/company-membership.service";
import type { EnvConfig } from "@/core/config/env.validation";
import type { AuthenticatedUser } from "@/common/interfaces/authenticated-user.interface";

// CPU-only inference on the dev remotesea-ai instance can take minutes (see
// that repo's README) — a chat/ask call needs a far longer budget than the
// 5s used for plain reachability checks below.
const ORCHESTRATOR_CALL_TIMEOUT_MS = 180_000;

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

  // The general-purpose forwarding path Chat (and any future orchestrator
  // feature) uses: mint this user's context token, call remotesea-ai's
  // /v1/orchestrator/... route, and hand back exactly what it returned.
  // remotesea-ai's own response status/body is propagated as-is on failure
  // (a 404 stays a 404) rather than collapsed into a generic 500 — same
  // "don't hide a real authorization/not-found signal" principle as
  // remotesea-ai's own tool_service.py uses when it calls back into this
  // app.
  async proxyToOrchestrator<T>(
    user: AuthenticatedUser,
    method: "GET" | "POST",
    path: string,
    body?: unknown,
  ): Promise<T> {
    if (!this.isConfigured) {
      throw new ServiceUnavailableException(
        "AI Orchestrator is not configured",
      );
    }

    const token = await this.mintContextToken(user);
    let response: Response;
    try {
      response = await fetch(`${this.aiServiceUrl}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(ORCHESTRATOR_CALL_TIMEOUT_MS),
      });
    } catch (error) {
      this.logger.warn(
        `Orchestrator call to ${path} failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw new ServiceUnavailableException("AI Orchestrator is unreachable");
    }

    const data = await response.json().catch(() => undefined);
    if (!response.ok) {
      throw new HttpException(
        data ?? "AI Orchestrator request failed",
        response.status,
      );
    }
    return data as T;
  }
}
