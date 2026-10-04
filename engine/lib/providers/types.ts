export type ProviderId = 'mistral' | 'gemini' | 'cerebras' | 'groq';

export type TokenUsage = { promptTokens: number; completionTokens: number; totalTokens: number };

export type ProviderAdapter = {
  id: ProviderId;
  /** "provider/model" — stored as mention_sentiments.model_version so lanes never collide */
  version: string;
  completeJson(prompt: string): Promise<{ text: string; usage: TokenUsage | null }>;
};

/** Rough request-token estimate for limiter admission (corrected by actual usage after). */
export function estimateTokens(prompt: string, batchTargets: number): number {
  return Math.ceil(prompt.length / 4) + batchTargets * 12;
}
