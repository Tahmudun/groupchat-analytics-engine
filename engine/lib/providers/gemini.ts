import { RateLimitError } from '@/lib/llm/groq';
import type { ProviderAdapter, TokenUsage } from './types';
import { PROVIDER_TIMEOUT_MS } from './openaiCompat';

const BASE = 'https://generativelanguage.googleapis.com/v1beta';

type ModelInfo = { name: string; supportedGenerationMethods?: string[] };

/**
 * Google AI Studio ships new flash-lite revisions often; hardcoding one goes
 * stale. Query the models list and pick the newest generally-available
 * flash-lite (skip preview/exp builds, which have separate tiny quotas).
 */
export async function pickFlashLiteModel(apiKey: string, fetchFn: typeof fetch = fetch): Promise<string> {
  const res = await fetchFn(`${BASE}/models?pageSize=200&key=${apiKey}`);
  if (!res.ok) throw new Error(`gemini models list ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const { models } = (await res.json()) as { models?: ModelInfo[] };
  const candidates = (models ?? [])
    .map(m => m.name.replace(/^models\//, ''))
    .filter((name, i) => {
      const info = (models ?? [])[i]!;
      return name.includes('flash-lite')
        && !/preview|exp/.test(name)
        && (info.supportedGenerationMethods ?? []).includes('generateContent');
    })
    // "gemini-2.5-flash-lite" > "gemini-2.0-flash-lite-001" under natural compare
    .sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
  if (candidates.length === 0) throw new Error('gemini: no non-preview flash-lite model in models list');
  return candidates[0]!;
}

type GenerateResponse = {
  candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; totalTokenCount?: number };
};

export async function makeGeminiAdapter(apiKey: string, maxTokens: number, fetchFn: typeof fetch = fetch): Promise<ProviderAdapter> {
  const model = await pickFlashLiteModel(apiKey, fetchFn);
  console.log(`gemini lane: picked model ${model}`);
  return {
    id: 'gemini',
    version: `gemini/${model}`,
    async completeJson(prompt) {
      const res = await fetchFn(`${BASE}/models/${model}:generateContent?key=${apiKey}`, {
        method: 'POST',
        signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0, maxOutputTokens: maxTokens, responseMimeType: 'application/json' },
        }),
      });
      if (res.status === 429) {
        const retryAfter = Number(res.headers.get('retry-after'));
        throw new RateLimitError('gemini 429', Number.isFinite(retryAfter) ? retryAfter * 1000 : undefined);
      }
      if (!res.ok) throw new Error(`gemini ${res.status}: ${(await res.text()).slice(0, 300)}`);
      const json = (await res.json()) as GenerateResponse;
      const text = json.candidates?.[0]?.content?.parts?.map(p => p.text ?? '').join('') ?? '';
      const u = json.usageMetadata;
      const usage: TokenUsage | null = u
        ? { promptTokens: u.promptTokenCount ?? 0, completionTokens: u.candidatesTokenCount ?? 0, totalTokens: u.totalTokenCount ?? 0 }
        : null;
      return { text, usage };
    },
  };
}
