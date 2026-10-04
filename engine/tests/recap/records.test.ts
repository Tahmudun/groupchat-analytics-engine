import { describe, expect, it } from 'vitest';
import { longestStreak, longestGap } from '@/lib/recap/records';

describe('longestStreak', () => {
  it('counts consecutive days', () => {
    expect(longestStreak(['2026-01-01', '2026-01-02', '2026-01-03', '2026-01-05'])).toBe(3);
  });
  it('handles unsorted + duplicate days', () => {
    expect(longestStreak(['2026-01-02', '2026-01-01', '2026-01-02'])).toBe(2);
  });
  it('single day = streak of 1, empty = 0', () => {
    expect(longestStreak(['2026-01-01'])).toBe(1);
    expect(longestStreak([])).toBe(0);
  });
});

describe('longestGap', () => {
  it('finds the widest absence between active days', () => {
    // active Jan 1 and Jan 10 → 8 full silent days between
    expect(longestGap(['2026-01-01', '2026-01-10'])).toBe(8);
  });
  it('no gap when contiguous; 0 for <2 days', () => {
    expect(longestGap(['2026-01-01', '2026-01-02'])).toBe(0);
    expect(longestGap(['2026-01-01'])).toBe(0);
  });
});
