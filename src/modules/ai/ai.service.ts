import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type {
  AiCompletionRequest,
  AiCompletionResult,
} from "./ai-provider.interface";
import { AnthropicProvider } from "./providers/anthropic.provider";
import { GeminiProvider } from "./providers/gemini.provider";
import type { EnvConfig } from "@/core/config/env.validation";

@Injectable()
export class AiService {
  private readonly provider: AnthropicProvider | GeminiProvider;

  constructor(
    config: ConfigService<EnvConfig, true>,
    anthropicProvider: AnthropicProvider,
    geminiProvider: GeminiProvider,
  ) {
    this.provider =
      config.get("AI_PROVIDER", { infer: true }) === "GEMINI"
        ? geminiProvider
        : anthropicProvider;
  }

  get isConfigured(): boolean {
    return this.provider.isConfigured;
  }

  complete(request: AiCompletionRequest): Promise<AiCompletionResult> {
    return this.provider.complete(request);
  }
}
