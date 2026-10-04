import { z } from 'zod';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import '@/lib/env'; // side effect: loads .env files so the API keys below exist
import { makeOpenAiCompatAdapter } from './openaiCompat';
import { makeGeminiAdapter } from './gemini';
import type { ProviderAdapter, ProviderId } from './types';

const LaneSchema = z.object({
  enabled: z.boolean(),
  model: z.string(),
  rpm: z.number().positive(),
  tpm: z.number().positive(),
  dailyTokens: z.number().positive().nullable(),
  dailyRequests: z.number().positive().nullable(),
  batchSize: z.number().int().positive(),
});
export type LaneConfig = z.infer<typeof LaneSchema>;

const ProvidersSchema = z.object({
  mistral: LaneSchema,
  gemini: LaneSchema,
  cerebras: LaneSchema,
  groq: LaneSchema,
});
export type ProvidersConfig = z.infer<typeof ProvidersSchema>;

export async function loadProvidersConfig(file = path.join(process.cwd(), 'providers.json')): Promise<ProvidersConfig> {
  const raw = JSON.parse(await readFile(file, 'utf8')) as Record<string, unknown>;
  delete raw._comment;
  return ProvidersSchema.parse(raw);
}

const KEY_ENV: Record<ProviderId, string> = {
  mistral: 'MISTRAL_API_KEY',
  gemini: 'GEMINI_API_KEY',
  cerebras: 'CEREBRAS_API_KEY',
  groq: 'GROQ_API_KEY',
};

// Cerebras' free tier caps context at 8192 tokens. gpt-oss reasoning tokens
// count toward max_tokens, so the completion budget must cover thinking AND
// the JSON — 4096 with a ~1.5k prompt still fits the window.
const MAX_TOKENS: Record<ProviderId, number> = { mistral: 2048, gemini: 2048, cerebras: 4096, groq: 2048 };

export type Lane = { adapter: ProviderAdapter; config: LaneConfig };

/** Build adapters for lanes that are enabled AND have a key in the env. */
export async function buildLanes(config: ProvidersConfig, only?: ProviderId[]): Promise<{ lanes: Lane[]; skipped: Array<{ id: ProviderId; reason: string }> }> {
  const lanes: Lane[] = [];
  const skipped: Array<{ id: ProviderId; reason: string }> = [];
  const ids = Object.keys(config) as ProviderId[];

  for (const id of ids) {
    const lane = config[id];
    if (only && !only.includes(id)) { skipped.push({ id, reason: 'not in --providers filter' }); continue; }
    if (!lane.enabled) { skipped.push({ id, reason: 'disabled in providers.json' }); continue; }
    const key = process.env[KEY_ENV[id]];
    if (!key) { skipped.push({ id, reason: `${KEY_ENV[id]} not set` }); continue; }

    try {
      if (id === 'gemini') {
        lanes.push({ adapter: await makeGeminiAdapter(key, MAX_TOKENS.gemini), config: lane });
      } else {
        const baseUrl = { mistral: 'https://api.mistral.ai/v1', cerebras: 'https://api.cerebras.ai/v1', groq: 'https://api.groq.com/openai/v1' }[id];
        lanes.push({
          adapter: makeOpenAiCompatAdapter({
            id, baseUrl, model: lane.model, apiKey: key,
            jsonMode: id !== 'cerebras', // gpt-oss reasoning model: plain text + lenient parse
            maxTokens: MAX_TOKENS[id],
            // sentiment triples need no deep chain-of-thought; low keeps the
            // reasoning from eating the completion budget
            extraBody: id === 'cerebras' ? { reasoning_effort: 'low' } : undefined,
          }),
          config: lane,
        });
      }
    } catch (err) {
      skipped.push({ id, reason: err instanceof Error ? err.message : String(err) });
    }
  }
  return { lanes, skipped };
}
