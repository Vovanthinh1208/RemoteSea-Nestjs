import { Body, Controller, Get, Param, Post, UseGuards } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { AiOrchestratorService } from "./ai-orchestrator.service";
import { ChatRequestDto, chatRequestSchema } from "./dto/chat.dto";
import { RATE_LIMITS } from "./constants";
import { CurrentUser } from "@/core/decorators/current-user.decorator";
import { JwtAuthGuard } from "@/core/guards/jwt-auth.guard";
import { ZodValidationPipe } from "@/core/pipes/zod-validation.pipe";
import { RateLimitService } from "@/common/services/rate-limit.service";
import type { AuthenticatedUser } from "@/common/interfaces/authenticated-user.interface";

// Response shapes below are passed through untyped from remotesea-ai
// (ChatResponse/ConversationSummaryResponse/ConversationDetailResponse) —
// its own Pydantic schemas are the source of truth for those, same
// reasoning as chatRequestSchema only validating what's worth failing fast
// on locally rather than duplicating the full response contract here.

@ApiTags("ai-orchestrator")
@Controller("ai-orchestrator")
@UseGuards(JwtAuthGuard)
export class AiOrchestratorController {
  constructor(
    private readonly aiOrchestratorService: AiOrchestratorService,
    private readonly rateLimitService: RateLimitService,
  ) {}

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

  // Phase 5: the actual remotesea-web-facing surface for AI Chat. This
  // controller never talks to remotesea-ai's Postgres or re-implements its
  // conversation-ownership check — proxyToOrchestrator forwards the same
  // signed context token remotesea-ai already trusts, and remotesea-ai's
  // own ChatService is what enforces "this conversation belongs to this
  // user" (see that repo's chat_service.py). What this side IS responsible
  // for: every call here is a real LLM completion at remotesea-ai, a direct
  // cost this endpoint previously left completely uncapped.
  @Post("chat")
  async chat(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(chatRequestSchema)) body: ChatRequestDto,
  ) {
    this.rateLimitService.enforce(
      `ai-chat:${user.id}`,
      RATE_LIMITS.CHAT.limit,
      RATE_LIMITS.CHAT.windowMs,
    );
    return this.aiOrchestratorService.proxyToOrchestrator(
      user,
      "POST",
      "/v1/orchestrator/chat",
      body,
    );
  }

  @Get("chat")
  async listConversations(@CurrentUser() user: AuthenticatedUser) {
    this.rateLimitService.enforce(
      `ai-chat-list:${user.id}`,
      RATE_LIMITS.LIST_CONVERSATIONS.limit,
      RATE_LIMITS.LIST_CONVERSATIONS.windowMs,
    );
    return this.aiOrchestratorService.proxyToOrchestrator(
      user,
      "GET",
      "/v1/orchestrator/chat",
    );
  }

  @Get("chat/:id")
  async getConversation(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
  ) {
    this.rateLimitService.enforce(
      `ai-chat-get:${user.id}`,
      RATE_LIMITS.GET_CONVERSATION.limit,
      RATE_LIMITS.GET_CONVERSATION.windowMs,
    );
    return this.aiOrchestratorService.proxyToOrchestrator(
      user,
      "GET",
      `/v1/orchestrator/chat/${encodeURIComponent(id)}`,
    );
  }
}
