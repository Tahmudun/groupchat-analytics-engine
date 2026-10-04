import { describe, expect, it } from 'vitest';
import { topCatchphrases } from '@/lib/recap/catchphrase';

function m(entries: Array<[string, number]>) { return new Map(entries); }

describe('topCatchphrases', () => {
  const global = m([['deadass', 120], ['bro', 5000], ['the', 90000], ['zamn', 20]]);
  const globalWords = 1_000_000;

  it('ranks by relative-frequency ratio, not raw count', () => {
    const member = m([['deadass', 100], ['bro', 100], ['the', 900]]);
    const out = topCatchphrases(member, 10_000, global, globalWords);
    expect(out[0]!.phrase).toBe('deadass'); // 1% of their words vs 0.012% globally
    expect(out[0]!.count).toBe(100);
    expect(out[0]!.ratio).toBeGreaterThan(50);
  });

  it('enforces the 15-use minimum and skips stopwords/short tokens', () => {
    const member = m([['zamn', 14], ['the', 900], ['ok', 500]]);
    expect(topCatchphrases(member, 10_000, global, globalWords)).toEqual([]);
  });

  it('caps at limit', () => {
    const member = m([['deadass', 50], ['zamn', 20], ['bro', 400]]);
    expect(topCatchphrases(member, 10_000, global, globalWords, 2)).toHaveLength(2);
  });
});
