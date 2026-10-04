import { describe, it, expect, vi } from 'vitest';
import { withBackoff, RateLimitError, makeGroqClient } from '@/lib/llm/groq';

describe('withBackoff', () => {
  it('retries on RateLimitError then succeeds', async () => {
    let calls = 0;
    const result = await withBackoff(async () => {
      calls += 1;
      if (calls < 3) throw new RateLimitError('429');
      return 'ok';
    }, { retries: 5, baseMs: 1 });
    expect(result).toBe('ok');
    expect(calls).toBe(3);
  });

  it('gives up after retries and rethrows', async () => {
    await expect(withBackoff(async () => { throw new RateLimitError('429'); }, { retries: 2, baseMs: 1 }))
      .rejects.toThrow('429');
  });

  it('does not retry non-rate-limit errors', async () => {
    let calls = 0;
    await expect(withBackoff(async () => { calls += 1; throw new Error('boom'); }, { retries: 3, baseMs: 1 }))
      .rejects.toThrow('boom');
    expect(calls).toBe(1);
  });
});

describe('makeGroqClient', () => {
  it('sends the right shape and surfaces 429 as RateLimitError', async () => {
    const fetchFn = vi.fn()
      .mockResolvedValueOnce(new Response('rate limited', { status: 429, headers: { 'retry-after': '1' } }));
    const client = makeGroqClient('test-key', fetchFn as unknown as typeof fetch);
    await expect(client.completeJson('hi')).rejects.toBeInstanceOf(RateLimitError);
    const [url, init] = fetchFn.mock.calls[0]!;
    expect(url).toContain('api.groq.com');
    expect(JSON.parse((init as RequestInit).body as string).model).toBe('llama-3.3-70b-versatile');
  });
});
