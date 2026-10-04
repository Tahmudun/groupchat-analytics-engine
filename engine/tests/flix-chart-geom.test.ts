import { describe, expect, it } from 'vitest';
import { buildDateAxis, nearestIndex } from '../lib/flix/chartGeom';

const pts = (...dates: string[]) => ({ points: dates.map(d => ({ date: d, score: 1 })) });

describe('buildDateAxis', () => {
  it('returns the sorted union of all series dates, deduped', () => {
    const axis = buildDateAxis([
      pts('2026-06-02', '2026-06-04'),
      pts('2026-06-01', '2026-06-02', '2026-06-05'),
    ]);
    expect(axis).toEqual(['2026-06-01', '2026-06-02', '2026-06-04', '2026-06-05']);
  });

  it('passes a single series through in order', () => {
    expect(buildDateAxis([pts('2026-01-01', '2026-01-02')])).toEqual(['2026-01-01', '2026-01-02']);
  });

  it('handles no series', () => {
    expect(buildDateAxis([])).toEqual([]);
  });
});

describe('nearestIndex', () => {
  it('maps the plot edges to the first and last index', () => {
    expect(nearestIndex(0, 14)).toBe(0);
    expect(nearestIndex(1, 14)).toBe(13);
  });

  it('snaps to the nearest step', () => {
    // 5 points → steps at t = 0, .25, .5, .75, 1
    expect(nearestIndex(0.3, 5)).toBe(1);
    expect(nearestIndex(0.4, 5)).toBe(2);
  });

  it('clamps out-of-range fractions (pointer in the padding)', () => {
    expect(nearestIndex(-0.2, 10)).toBe(0);
    expect(nearestIndex(1.3, 10)).toBe(9);
  });

  it('degenerate axes never go out of bounds', () => {
    expect(nearestIndex(0.7, 1)).toBe(0);
    expect(nearestIndex(0.7, 0)).toBe(0);
  });
});
