/** Reorder a list of row ids by moving `id` one step. Returns the ids in
 *  their new order (caller renumbers positions 1..n), or null when the move
 *  is a no-op — id absent, or already at that end. */
export function moveId(ids: number[], id: number, dir: 'up' | 'down'): number[] | null {
  const i = ids.indexOf(id);
  if (i === -1) return null;
  const j = dir === 'up' ? i - 1 : i + 1;
  if (j < 0 || j >= ids.length) return null;
  const next = [...ids];
  [next[i], next[j]] = [next[j]!, next[i]!];
  return next;
}
