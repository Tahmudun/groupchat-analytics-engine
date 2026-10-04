const DAY_MS = 86_400_000;

function toSortedUniqueEpochDays(days: string[]): number[] {
  return [...new Set(days)]
    .map(d => Date.parse(`${d}T00:00:00Z`) / DAY_MS)
    .sort((a, b) => a - b);
}

/** Longest run of consecutive active days. */
export function longestStreak(days: string[]): number {
  const ds = toSortedUniqueEpochDays(days);
  let best = ds.length > 0 ? 1 : 0;
  let run = best;
  for (let i = 1; i < ds.length; i++) {
    run = ds[i]! - ds[i - 1]! === 1 ? run + 1 : 1;
    if (run > best) best = run;
  }
  return best;
}

/** Widest count of fully-silent days between two active days. */
export function longestGap(days: string[]): number {
  const ds = toSortedUniqueEpochDays(days);
  let best = 0;
  for (let i = 1; i < ds.length; i++) best = Math.max(best, ds[i]! - ds[i - 1]! - 1);
  return best;
}
