import { describe, it, expect } from 'vitest';
import { validateMergeInput } from '@/lib/admin/merge';
import { toSuggestion } from '@/lib/admin/mergeSuggestions';

describe('validateMergeInput', () => {
  it('accepts a well-formed merge', () => {
    expect(validateMergeInput('Leo Martins 🦁', ['Leo Martins ⚡'])).toBeNull();
    expect(validateMergeInput('A', ['B', 'C'])).toBeNull();
  });

  it('requires a canonical member', () => {
    expect(validateMergeInput('', ['B'])).toMatch(/canonical/i);
    expect(validateMergeInput('   ', ['B'])).toMatch(/canonical/i);
  });

  it('requires at least one source', () => {
    expect(validateMergeInput('A', [])).toMatch(/at least one source/i);
  });

  it('rejects empty source names', () => {
    expect(validateMergeInput('A', ['B', ''])).toMatch(/non-empty/i);
  });

  it('rejects the canonical appearing as a source', () => {
    expect(validateMergeInput('A', ['A'])).toMatch(/cannot also be a source/i);
    expect(validateMergeInput('A', ['B', 'A'])).toMatch(/cannot also be a source/i);
  });

  it('rejects duplicate sources', () => {
    expect(validateMergeInput('A', ['B', 'B'])).toMatch(/distinct/i);
  });
});

describe('toSuggestion', () => {
  it('picks the busier account as the default canonical', () => {
    const s = toSuggestion({ a: 'Leo Martins 🦁', b: 'Leo Martins ⚡', similarity: 0.91, a_count: 5000, b_count: 200 });
    expect(s.suggestedCanonical).toBe('Leo Martins 🦁');
    expect(s.members).toEqual(['Leo Martins 🦁', 'Leo Martins ⚡']);
    expect(s.counts).toEqual({ 'Leo Martins 🦁': 5000, 'Leo Martins ⚡': 200 });
  });

  it('flips canonical when b has more messages', () => {
    const s = toSuggestion({ a: 'old name', b: 'new name', similarity: 0.8, a_count: 10, b_count: 900 });
    expect(s.suggestedCanonical).toBe('new name');
  });

  it('breaks ties toward a', () => {
    const s = toSuggestion({ a: 'x', b: 'y', similarity: 0.7, a_count: 50, b_count: 50 });
    expect(s.suggestedCanonical).toBe('x');
  });

  it('rounds similarity to three places', () => {
    const s = toSuggestion({ a: 'x', b: 'y', similarity: 0.876543, a_count: 1, b_count: 1 });
    expect(s.similarity).toBe(0.877);
  });
});
