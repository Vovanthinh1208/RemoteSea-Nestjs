export interface AiCompletionRequest {
  maxTokens: number;
  system: string;
  prompt: string;
}

export interface AiCompletionResult {
  text: string;
  // The model that actually answered — callers persist this (e.g.
  // CvAnalysis.model) instead of a constant, so the record stays accurate
  // regardless of which provider generated it or how its default model
  // changes over time.
  model: string;
}

/**
 * One vendor's implementation of "take a prompt, return text." Deliberately
 * doesn't take a `model` in the request — which models exist and which is
 * the right default for a given cost/quality tradeoff is provider-specific
 * knowledge, not something a feature service (which only knows "use the
 * fast/cheap tier") should have to track across providers.
 */
export interface AiProvider {
  readonly name: string;
  readonly isConfigured: boolean;
  complete(request: AiCompletionRequest): Promise<AiCompletionResult>;
}
