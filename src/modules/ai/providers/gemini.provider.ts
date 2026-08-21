import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { ApiError, GoogleGenAI } from "@google/genai";
import type {
  AiCompletionRequest,
  AiCompletionResult,
  AiProvider,
} from "../ai-provider.interface";
import { ServiceUnavailableApiException } from "@/common/exceptions/api.exception";
import type { EnvConfig } from "@/core/config/env.validation";

const DEFAULT_MODEL = "gemini-2.5-flash";
// A 401/403 here means GEMINI_API_KEY is set but invalid/unauthorized — same
// "actionable config bug, log it loudly" treatment as Anthropic's
// AuthenticationError (see AnthropicProvider).
const AUTH_ERROR_STATUSES: ReadonlySet<number> = new Set([401, 403]);

@Injectable()
export class GeminiProvider implements AiProvider {
  readonly name = "GEMINI";
  private readonly logger = new Logger(GeminiProvider.name);
  private readonly client: GoogleGenAI | null;

  constructor(config: ConfigService<EnvConfig, true>) {
    const apiKey = config.get("GEMINI_API_KEY", { infer: true });
    this.client = apiKey ? new GoogleGenAI({ apiKey }) : null;
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

    try {
      const response = await this.client.models.generateContent({
        model: DEFAULT_MODEL,
        contents: request.prompt,
        config: {
          systemInstruction: request.system,
          maxOutputTokens: request.maxTokens,
          // Same bounded-request reasoning as AnthropicProvider's client
          // timeout — this runs inline within an HTTP request.
          httpOptions: { timeout: 30_000 },
        },
      });
      return { text: response.text ?? "", model: DEFAULT_MODEL };
    } catch (error) {
      if (error instanceof ApiError && AUTH_ERROR_STATUSES.has(error.status)) {
        this.logger.error(
          "Gemini API call failed authentication — check GEMINI_API_KEY",
          error,
        );
      } else {
        this.logger.warn("Gemini API call failed", error);
      }
      throw new ServiceUnavailableApiException(
        "The AI service is temporarily unavailable. Please try again shortly.",
      );
    }
  }
}
