import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { ApiError, GoogleGenAI, ThinkingLevel } from "@google/genai";
import type {
  AiCompletionRequest,
  AiCompletionResult,
  AiProvider,
} from "../ai-provider.interface";
import { ServiceUnavailableApiException } from "@/common/exceptions/api.exception";
import type { EnvConfig } from "@/core/config/env.validation";

// gemini-2.5-flash was retired ("no longer available to new users" per the
// API's own error) — 3.6 is Google's current fast/cheap tier.
const DEFAULT_MODEL = "gemini-3.6-flash";
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
          // 3.x models think by default, spending part of maxOutputTokens on
          // invisible reasoning before the real answer — for a
          // structured-JSON task like this (see CvAnalysisService), that risks
          // silently eating the whole budget and truncating the actual
          // output. gemini-3.6-flash rejects thinkingBudget: 0 outright
          // (400 — this model line doesn't support fully disabling it);
          // MINIMAL is the lowest level it accepts, verified to produce zero
          // thoughtsTokenCount in practice.
          thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL },
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
