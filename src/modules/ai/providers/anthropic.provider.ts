import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import Anthropic from "@anthropic-ai/sdk";
import type {
  AiCompletionRequest,
  AiCompletionResult,
  AiProvider,
} from "../ai-provider.interface";
import { ServiceUnavailableApiException } from "@/common/exceptions/api.exception";
import type { EnvConfig } from "@/core/config/env.validation";

const DEFAULT_MODEL = "claude-haiku-4-5-20251001";

@Injectable()
export class AnthropicProvider implements AiProvider {
  readonly name = "ANTHROPIC";
  private readonly logger = new Logger(AnthropicProvider.name);
  private readonly client: Anthropic | null;

  constructor(config: ConfigService<EnvConfig, true>) {
    const apiKey = config.get("ANTHROPIC_API_KEY", { infer: true });
    // SDK default timeout is 10 minutes — fine for a background job, much
    // too long for a call made inline within an HTTP request (no queue
    // exists yet, see the AI roadmap's infra note).
    this.client = apiKey ? new Anthropic({ apiKey, timeout: 30_000 }) : null;
  }

  get isConfigured(): boolean {
    return this.client !== null;
  }

  async complete(request: AiCompletionRequest): Promise<AiCompletionResult> {
    if (!this.client) {
      throw new ServiceUnavailableApiException(
        "AI features are not configured.",
      );
    }

    let response: Anthropic.Message;
    try {
      response = await this.client.messages.create({
        model: DEFAULT_MODEL,
        max_tokens: request.maxTokens,
        system: request.system,
        messages: [{ role: "user", content: request.prompt }],
      });
    } catch (error) {
      // AuthenticationError means ANTHROPIC_API_KEY is set but wrong — an
      // actionable config bug, not a transient upstream blip, so it's worth
      // logging at a level/detail that gets someone to go fix the key rather
      // than blending into ordinary "Anthropic had a bad moment" noise.
      if (error instanceof Anthropic.AuthenticationError) {
        this.logger.error(
          "Anthropic API call failed authentication — check ANTHROPIC_API_KEY",
          error,
        );
      } else {
        this.logger.warn("Anthropic API call failed", error);
      }
      throw new ServiceUnavailableApiException(
        "The AI service is temporarily unavailable. Please try again shortly.",
      );
    }

    const block = response.content[0];
    return {
      text: block?.type === "text" ? block.text : "",
      model: response.model,
    };
  }
}
