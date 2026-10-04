export class RateLimitError extends Error {
  retryAfterMs?: number;
  constructor(message: string, retryAfterMs?: number) {
    super(message);
    this.retryAfterMs = retryAfterMs;
  }
}

export type LlmClient = {
  name: string;
  completeJson(prompt: string, opts?: { maxTokens?: number }): Promise<string>;
};

const sleep = (ms: number) => new Promise(res => setTimeout(res, ms));

export async function withBackoff<T>(
  fn: () => Promise<T>,
  opts: { retries?: number; baseMs?: number } = {},
): Promise<T> {
  const retries = opts.retries ?? 5;
  const baseMs = opts.baseMs ?? 2000;
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (!(err instanceof RateLimitError) || attempt >= retries) throw err;
      const wait = err.retryAfterMs ?? baseMs * 2 ** attempt;
      await sleep(wait);
    }
  }
}

const GROQ_MODEL = 'llama-3.3-70b-versatile';

export function makeGroqClient(apiKey: string, fetchFn: typeof fetch = fetch): LlmClient {
  return {
    name: `groq:${GROQ_MODEL}`,
    async completeJson(prompt, opts = {}) {
      const res = await fetchFn('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
        body: JSON.stringify({
          model: GROQ_MODEL,
          messages: [
            // json_object mode requires the word "json" somewhere in the
            // conversation; this system message guarantees it for any prompt.
            { role: 'system', content: 'Respond only with valid JSON.' },
            { role: 'user', content: prompt },
          ],
          response_format: { type: 'json_object' },
          temperature: 0,
          max_tokens: opts.maxTokens ?? 2048,
        }),
      });
      if (res.status === 429) {
        const retryAfter = Number(res.headers.get('retry-after'));
        throw new RateLimitError('groq 429', Number.isFinite(retryAfter) ? retryAfter * 1000 : undefined);
      }
      if (!res.ok) throw new Error(`groq ${res.status}: ${await res.text()}`);
      const json = (await res.json()) as { choices: Array<{ message: { content: string } }> };
      return json.choices[0]!.message.content;
    },
  };
}
