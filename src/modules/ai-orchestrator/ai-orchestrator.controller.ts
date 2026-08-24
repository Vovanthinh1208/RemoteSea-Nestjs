import { Controller, Get, UseGuards } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { AiOrchestratorService } from "./ai-orchestrator.service";
import { CurrentUser } from "@/core/decorators/current-user.decorator";
import { JwtAuthGuard } from "@/core/guards/jwt-auth.guard";
import type { AuthenticatedUser } from "@/common/interfaces/authenticated-user.interface";

@ApiTags("ai-orchestrator")
@Controller("ai-orchestrator")
@UseGuards(JwtAuthGuard)
export class AiOrchestratorController {
  constructor(private readonly aiOrchestratorService: AiOrchestratorService) {}

  // Phase 1 round-trip proof only — no RAG/tool-calling/LLM invocation
  // happens here. Any authenticated user (TALENT or EMPLOYER) can call this;
  // it proves both directions of the api<->ai contract in one request:
  // this endpoint reaching remotesea-ai directly, and remotesea-ai reaching
  // back into this app's own /health using the context token this endpoint
  // mints for the caller.
  @Get("health")
  async health(@CurrentUser() user: AuthenticatedUser) {
    const [outbound, roundTrip] = await Promise.all([
      this.aiOrchestratorService.checkAiServiceReachable(),
      this.aiOrchestratorService.pingOrchestrator(user),
    ]);

    return {
      configured: this.aiOrchestratorService.isConfigured,
      apiToAi: outbound,
      aiToApiRoundTrip: roundTrip,
    };
  }
}
