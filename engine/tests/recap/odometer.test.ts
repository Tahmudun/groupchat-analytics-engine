import { describe, expect, it } from 'vitest';
import { splitForOdometer } from '@/lib/recap/odometer';

describe('splitForOdometer', () => {
  it('splits digits and merges text runs', () => {
    expect(splitForOdometer('36,462 episodes')).toEqual([
      { kind: 'digit', value: 3 }, { kind: 'digit', value: 6 },
      { kind: 'text', value: ',' },
      { kind: 'digit', value: 4 }, { kind: 'digit', value: 6 }, { kind: 'digit', value: 2 },
      { kind: 'text', value: ' episodes' },
    ]);
  });
  it('handles percent strings', () => {
    expect(splitForOdometer('62% approval')).toEqual([
      { kind: 'digit', value: 6 }, { kind: 'digit', value: 2 },
      { kind: 'text', value: '% approval' },
    ]);
  });
  it('passes through digit-free strings as one text part', () => {
    expect(splitForOdometer('Cult Classic')).toEqual([{ kind: 'text', value: 'Cult Classic' }]);
  });
});
