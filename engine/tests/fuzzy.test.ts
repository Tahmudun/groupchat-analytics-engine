import { describe, it, expect } from 'vitest';
import { levenshtein } from '@/lib/mentions/fuzzy';

describe('levenshtein', () => {
  it('computes classic distances', () => {
    expect(levenshtein('kitten', 'sitting')).toBe(3);
    expect(levenshtein('abc', 'abc')).toBe(0);
    expect(levenshtein('', 'abc')).toBe(3);
  });
  it('early-exits past max (returns max+1)', () => {
    expect(levenshtein('completely', 'different', 2)).toBe(3);
  });
  it('counts adjacent transpositions as one edit (OSA)', () => {
    expect(levenshtein('wrenn', 'wren')).toBe(1);
    expect(levenshtein('teh', 'the')).toBe(1);
  });
});
