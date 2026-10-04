import { RateLimitError } from '@/lib/llm/groq';
import type { ProviderAdapter, ProviderId, TokenUsage } from './types';

type CompatOpts = {
  id: ProviderId;
  baseUrl: string;
  model: string;
  apiKey: string;
  /** send response_format json_object (Mistral/Groq honor it; Cerebras gpt-oss does not) */
  jsonMode: boolean;
  maxTokens: number;
  /** provider-specific request fields (e.g. reasoning_effort for gpt-oss) */
  extraBody?: Record<string, unknown>;
  fetchFn?: typeof fetch;
};

type ChatCompletion = {
  choices: Array<{ message: { content: string | null } }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
};

export const PROVIDER_TIMEOUT_MS = 90_000;

/** Mistral, Cerebras and Groq all speak the OpenAI chat-completions dialect. */
export function makeOpenAiCompatAdapter(opts: CompatOpts): ProviderAdapter {
  const fetchFn = opts.fetchFn ?? fetch;
  return {
    id: opts.id,
    version: `${opts.id}/${opts.model}`,
    async completeJson(prompt) {
      const res = await fetchFn(`${opts.baseUrl}/chat/completions`, {
        method: 'POST',
        signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
        headers: { authorization: `Bearer ${opts.apiKey}`, 'content-type': 'application/json' },
        body: JSON.stringify({
          model: opts.model,
          messages: [
            { role: 'system', content: 'Respond only with valid JSON.' },
            { role: 'user', content: prompt },
          ],
          ...(opts.jsonMode ? { response_format: { type: 'json_object' } } : {}),
          temperature: 0,
          max_tokens: opts.maxTokens,
          ...opts.extraBody,
        }),
      });
      if (res.status === 429) {
        const retryAfter = Number(res.headers.get('retry-after'));
        throw new RateLimitError(`${opts.id} 429`, Number.isFinite(retryAfter) ? retryAfter * 1000 : undefined);
      }
      if (!res.ok) throw new Error(`${opts.id} ${res.status}: ${(await res.text()).slice(0, 300)}`);
      const json = (await res.json()) as ChatCompletion;
      const text = json.choices[0]?.message?.content ?? '';
      const usage: TokenUsage | null = json.usage
        ? {
            promptTokens: json.usage.prompt_tokens ?? 0,
            completionTokens: json.usage.completion_tokens ?? 0,
            totalTokens: json.usage.total_tokens ?? (json.usage.prompt_tokens ?? 0) + (json.usage.completion_tokens ?? 0),
          }
        : null;
      return { text, usage };
    },
  };
}
