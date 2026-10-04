import { describe, it, expect } from 'vitest';
import { selectPending } from '@/lib/db/migrate';

describe('selectPending', () => {
  it('returns .sql files in lexical order, skipping applied ones', () => {
    const files = ['101_member_aliases.sql', 'README.md', '100_chats_multitenant.sql', '102_sentiment_tables.sql'];
    const applied = new Set(['100_chats_multitenant.sql']);
    expect(selectPending(files, applied)).toEqual(['101_member_aliases.sql', '102_sentiment_tables.sql']);
  });

  it('returns empty when everything is applied', () => {
    expect(selectPending(['100_a.sql'], new Set(['100_a.sql']))).toEqual([]);
  });
});
