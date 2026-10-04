import { env } from '@/lib/env';
import { makeGroqClient, type LlmClient } from './groq';
import { makeOllamaClient, ollamaReachable } from './ollama';

export async function pickEngine(): Promise<LlmClient> {
  const mode = env.SENTIMENT_ENGINE;
  if (mode === 'groq' || (mode === 'auto' && env.GROQ_API_KEY)) {
    if (!env.GROQ_API_KEY) throw new Error('SENTIMENT_ENGINE=groq but GROQ_API_KEY is unset');
    return makeGroqClient(env.GROQ_API_KEY);
  }
  if (!(await ollamaReachable(env.OLLAMA_URL))) {
    throw new Error(`No LLM available: mode=${mode}, ollama unreachable at ${env.OLLAMA_URL} (is 'brew services start ollama' running?)`);
  }
  return makeOllamaClient(env.OLLAMA_URL);
}
