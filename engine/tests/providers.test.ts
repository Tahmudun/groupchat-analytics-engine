import { describe, it, expect } from 'vitest';
import { makeOpenAiCompatAdapter } from '@/lib/providers/openaiCompat';
import { pickFlashLiteModel } from '@/lib/providers/gemini';
import { loadProvidersConfig } from '@/lib/providers/config';
import { estimateTokens } from '@/lib/providers/types';
import { RateLimitError } from '@/lib/llm/groq';
import path from 'node:path';

function fakeFetch(status: number, body: unknown, headers: Record<string, string> = {}): typeof fetch {
  return (async () => new Response(JSON.stringify(body), { status, headers })) as typeof fetch;
}

describe('makeOpenAiCompatAdapter', () => {
  const base = { id: 'mistral' as const, baseUrl: 'https://x', model: 'm', apiKey: 'k', maxTokens: 100 };

  it('returns text + usage and formats the version string', async () => {
    const a = makeOpenAiCompatAdapter({ ...base, jsonMode: true, fetchFn: fakeFetch(200, {
      choices: [{ message: { content: '[[1,"a",0.5]]' } }],
      usage: { prompt_tokens: 100, completion_tokens: 20, total_tokens: 120 },
    }) });
    expect(a.version).toBe('mistral/m');
    const { text, usage } = await a.completeJson('p');
    expect(text).toBe('[[1,"a",0.5]]');
    expect(usage).toEqual({ promptTokens: 100, completionTokens: 20, totalTokens: 120 });
  });

  it('sends response_format only in jsonMode', async () => {
    let sentBody = '';
    const spyFetch: typeof fetch = (async (_url: unknown, init?: RequestInit) => {
      sentBody = String(init?.body);
      return new Response(JSON.stringify({ choices: [{ message: { content: '{}' } }] }), { status: 200 });
    }) as typeof fetch;
    await makeOpenAiCompatAdapter({ ...base, jsonMode: true, fetchFn: spyFetch }).completeJson('p');
    expect(sentBody).toContain('response_format');
    await makeOpenAiCompatAdapter({ ...base, id: 'cerebras', jsonMode: false, fetchFn: spyFetch }).completeJson('p');
    expect(sentBody).not.toContain('response_format');
  });

  it('throws RateLimitError with Retry-After on 429', async () => {
    const a = makeOpenAiCompatAdapter({ ...base, jsonMode: true, fetchFn: fakeFetch(429, {}, { 'retry-after': '17' }) });
    const err = await a.completeJson('p').catch(e => e);
    expect(err).toBeInstanceOf(RateLimitError);
    expect((err as RateLimitError).retryAfterMs).toBe(17_000);
  });

  it('throws a labeled error on other failures', async () => {
    const a = makeOpenAiCompatAdapter({ ...base, jsonMode: true, fetchFn: fakeFetch(500, { oops: true }) });
    await expect(a.completeJson('p')).rejects.toThrow(/mistral 500/);
  });
});

describe('pickFlashLiteModel', () => {
  it('picks the newest GA flash-lite, skipping preview/exp builds', async () => {
    const models = [
      { name: 'models/gemini-2.0-flash-lite-001', supportedGenerationMethods: ['generateContent'] },
      { name: 'models/gemini-2.5-flash-lite', supportedGenerationMethods: ['generateContent'] },
      { name: 'models/gemini-3.0-flash-lite-preview-01', supportedGenerationMethods: ['generateContent'] },
      { name: 'models/gemini-2.5-flash-lite-exp', supportedGenerationMethods: ['generateContent'] },
      { name: 'models/gemini-2.5-flash', supportedGenerationMethods: ['generateContent'] },
      { name: 'models/gemini-9.9-flash-lite-embed', supportedGenerationMethods: ['embedContent'] },
    ];
    expect(await pickFlashLiteModel('k', fakeFetch(200, { models }))).toBe('gemini-2.5-flash-lite');
  });

  it('throws when nothing matches', async () => {
    await expect(pickFlashLiteModel('k', fakeFetch(200, { models: [] }))).rejects.toThrow(/no non-preview flash-lite/);
  });
});

describe('providers.json', () => {
  it('parses the checked-in config with all four lanes', async () => {
    const cfg = await loadProvidersConfig(path.join(__dirname, '..', 'providers.json'));
    expect(Object.keys(cfg).sort()).toEqual(['cerebras', 'gemini', 'groq', 'mistral']);
    expect(cfg.cerebras.batchSize).toBeLessThanOrEqual(15); // 8192-token context cap
    for (const lane of Object.values(cfg)) {
      expect(lane.rpm).toBeGreaterThan(0);
      expect(lane.tpm).toBeGreaterThan(0);
    }
  });
});

describe('estimateTokens', () => {
  it('scales with prompt length and target count', () => {
    expect(estimateTokens('x'.repeat(4000), 25)).toBe(1000 + 300);
  });
});
