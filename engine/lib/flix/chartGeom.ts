// Pure geometry for the market chart's shared x-axis and hover snapping —
// kept out of the component so it can be unit tested.

export type AxisPoint = { date: string; score: number };

/** Sorted union of every series' dates: the shared x-axis. Lines with missing
 *  days land on the right calendar position instead of being stretched. */
export function buildDateAxis(series: { points: AxisPoint[] }[]): string[] {
  const set = new Set<string>();
  for (const s of series) for (const p of s.points) set.add(p.date);
  return [...set].sort();
}

/** Snap a 0..1 plot-x fraction to the nearest axis index (clamped, so a
 *  pointer in the chart padding still resolves to an endpoint). */
export function nearestIndex(t: number, len: number): number {
  if (len <= 1) return 0;
  const clamped = Math.max(0, Math.min(1, t));
  return Math.round(clamped * (len - 1));
}
