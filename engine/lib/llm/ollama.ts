import type { LlmClient } from './groq';

const OLLAMA_MODEL = 'gemma2:2b';

export function makeOllamaClient(baseUrl: string, fetchFn: typeof fetch = fetch): LlmClient {
  return {
    name: `ollama:${OLLAMA_MODEL}`,
    async completeJson(prompt, opts = {}) {
      const res = await fetchFn(`${baseUrl}/api/generate`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          model: OLLAMA_MODEL,
          prompt,
          format: 'json',
          stream: false,
          options: { temperature: 0, num_predict: opts.maxTokens ?? 2048 },
        }),
      });
      if (!res.ok) throw new Error(`ollama ${res.status}: ${await res.text()}`);
      const json = (await res.json()) as { response: string };
      return json.response;
    },
  };
}

export async function ollamaReachable(baseUrl: string, fetchFn: typeof fetch = fetch): Promise<boolean> {
  try {
    const res = await fetchFn(`${baseUrl}/api/version`, { signal: AbortSignal.timeout(2000) });
    return res.ok;
  } catch {
    return false;
  }
}
