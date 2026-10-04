/** Edit distance with adjacent-transposition support (OSA variant of
 *  Damerau-Levenshtein) and a band cutoff: returns max+1 as soon as the
 *  distance provably exceeds max. Transpositions count 1 so the common
 *  name typo 'wrenn' -> 'wren' stays cheap while unrelated words don't. */
export function levenshtein(a: string, b: string, max = Infinity): number {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev2: number[] | null = null;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const curr = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let d = Math.min(curr[j - 1]! + 1, prev[j]! + 1, prev[j - 1]! + cost);
      if (prev2 && i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        d = Math.min(d, prev2[j - 2]! + 1);
      }
      curr[j] = d;
      rowMin = Math.min(rowMin, d);
    }
    if (rowMin > max) return max + 1;
    prev2 = prev;
    prev = curr;
  }
  return prev[b.length]!;
}
