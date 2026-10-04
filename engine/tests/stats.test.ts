import { describe, it, expect } from 'vitest';
import { pearson, calibrationMetrics, type PairScore } from '@/lib/dispatch/stats';

describe('pearson', () => {
  it('is 1 for a perfect linear relationship', () => {
    expect(pearson([1, 2, 3], [2, 4, 6])).toBeCloseTo(1);
  });
  it('is -1 for a perfect inverse relationship', () => {
    expect(pearson([1, 2, 3], [3, 2, 1])).toBeCloseTo(-1);
  });
  it('computes a known intermediate value', () => {
    expect(pearson([1, 2, 3, 4, 5], [2, 1, 4, 3, 5])).toBeCloseTo(0.8);
  });
  it('is NaN for constant or tiny series', () => {
    expect(pearson([1, 1, 1], [1, 2, 3])).toBeNaN();
    expect(pearson([1], [1])).toBeNaN();
  });
});

function pair(msg: string, member: string, date: string, score: number): PairScore {
  return { message_id: msg, member_username: member, date, score };
}

describe('calibrationMetrics', () => {
  const reference = [
    pair('m1', 'a', '2026-01-01', 0.8),
    pair('m2', 'a', '2026-01-01', 0.4),
    pair('m3', 'a', '2026-01-02', -0.5),
    pair('m4', 'b', '2026-01-01', 0.1),
    pair('m5', 'b', '2026-01-02', 0.9),
  ];

  it('correlates perfectly with itself', () => {
    const m = calibrationMetrics(reference, reference);
    expect(m.pairCount).toBe(5);
    expect(m.coverage).toBe(1);
    expect(m.messageR).toBeCloseTo(1);
    expect(m.dailyMeanR).toBeCloseTo(1);
    expect(m.dailyCells).toBe(4); // (a,1) (a,2) (b,1) (b,2)
  });

  it('averages multiple pairs into one daily cell', () => {
    // candidate flips m1/m2 but keeps the same (a, 01-01) mean → daily r stays 1
    const candidate = [
      pair('m1', 'a', '2026-01-01', 0.4),
      pair('m2', 'a', '2026-01-01', 0.8),
      pair('m3', 'a', '2026-01-02', -0.5),
      pair('m4', 'b', '2026-01-01', 0.1),
      pair('m5', 'b', '2026-01-02', 0.9),
    ];
    const m = calibrationMetrics(reference, candidate);
    expect(m.dailyMeanR).toBeCloseTo(1);
    expect(m.messageR).toBeLessThan(1); // pair-level disagreement still visible
  });

  it('ignores pairs the candidate missed and reports coverage', () => {
    const m = calibrationMetrics(reference, reference.slice(0, 4));
    expect(m.pairCount).toBe(4);
    expect(m.coverage).toBeCloseTo(0.8);
  });

  it('handles empty candidate without throwing', () => {
    const m = calibrationMetrics(reference, []);
    expect(m.pairCount).toBe(0);
    expect(m.messageR).toBeNaN();
  });
});
