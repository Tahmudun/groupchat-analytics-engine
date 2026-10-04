import { describe, expect, it } from 'vitest';
import { keyartFor, KEYART_PRESETS } from '@/lib/flix/keyart';

describe('keyartFor', () => {
  it('is deterministic for a given seed', () => {
    const a = keyartFor('monkey.t');
    const b = keyartFor('monkey.t');
    expect(a).toEqual(b);
    expect(KEYART_PRESETS[a.id]).toBe(a.css);
  });

  it('different seeds can land on different presets', () => {
    const ids = new Set(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map(s => keyartFor(s).id));
    expect(ids.size).toBeGreaterThan(1);
  });

  it('an explicit valid preset wins over the seed hash', () => {
    const id = Object.keys(KEYART_PRESETS)[0]!;
    expect(keyartFor('whatever', id).id).toBe(id);
    expect(keyartFor('whatever', id).css).toBe(KEYART_PRESETS[id]);
  });

  it('an unknown preset falls back to the seed hash', () => {
    expect(keyartFor('monkey.t', 'not-a-preset')).toEqual(keyartFor('monkey.t'));
    expect(keyartFor('monkey.t', null)).toEqual(keyartFor('monkey.t'));
  });
});
