import { describe, it, expect } from 'vitest';
import { encodeCursor, decodeCursor, SearchBodySchema } from '@/lib/search/query';

describe('cursor round-trip', () => {
  it('encodes and decodes (timestamp_ms, id)', () => {
    const c = encodeCursor(1700000000000, 'abc123');
    expect(decodeCursor(c)).toEqual({ timestampMs: 1700000000000, id: 'abc123' });
  });
  it('rejects garbage cursors', () => {
    expect(() => decodeCursor('not-a-cursor')).toThrow(/cursor/i);
  });
});

describe('SearchBodySchema', () => {
  it('applies defaults', () => {
    const body = SearchBodySchema.parse({});
    expect(body.limit).toBe(25);
    expect(body.sort).toBe('newest');
  });
  it('caps limit at 100', () => {
    expect(() => SearchBodySchema.parse({ limit: 500 })).toThrow();
  });
  it('rejects unknown sort values', () => {
    expect(() => SearchBodySchema.parse({ sort: 'bestest' })).toThrow();
  });
});
