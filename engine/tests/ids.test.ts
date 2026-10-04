import { describe, it, expect } from 'vitest';
import { legacyMessageId, messageRowId } from '@/lib/ingestion/ids';

describe('legacyMessageId — must match search-engine/backend/parser.py exactly', () => {
  it('matches Python for ascii content with trailing space (trim-in-hash rule)', () => {
    // golden value from parser.py make_message_id("alice", 1700000000000, "hello world ")
    expect(legacyMessageId('alice', 1700000000000, 'hello world ')).toBe('56bedbf48226770cb3c291879b412e7b');
  });

  it('matches Python for emoji sender + empty content', () => {
    // golden value from parser.py make_message_id("Leo Martins \U0001F981", 1700000000001, "")
    expect(legacyMessageId('Leo Martins 🦁', 1700000000001, '')).toBe('f8b28eea9be9ef85466f635cdcf434bd');
  });
});

describe('messageRowId', () => {
  it('is the platform id itself for flix-original (legacy compat)', () => {
    expect(messageRowId('flix-original', 'abc123')).toBe('abc123');
  });

  it('is namespaced for any other chat', () => {
    const id = messageRowId('other-chat', 'abc123');
    expect(id).not.toBe('abc123');
    expect(id).toMatch(/^[0-9a-f]{32}$/);
  });
});
