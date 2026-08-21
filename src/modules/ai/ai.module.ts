import { Module } from "@nestjs/common";
import { AiService } from "./ai.service";
import { AnthropicProvider } from "./providers/anthropic.provider";
import { GeminiProvider } from "./providers/gemini.provider";

@Module({
  // Both providers are always constructed (each is a no-op/unconfigured
  // shell when its own API key is unset — see their constructors), and
  // AiService picks between them via AI_PROVIDER at construction time. This
  // keeps provider selection a plain runtime read instead of conditional
  // module wiring, so switching providers is a config change, not a redeploy
  // with a different module graph.
  providers: [AiService, AnthropicProvider, GeminiProvider],
  exports: [AiService],
})
export class AiModule {}
