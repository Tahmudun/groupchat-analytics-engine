import { STOPWORDS } from '@/lib/mentions/stopwords';

const MIN_USES = 15;
const MIN_LEN = 3;

/** "Word of the year": tokens this member uses far more than the group
 *  baseline. ratio = (memberCount/memberWords) / (globalCount/globalWords). */
export function topCatchphrases(
  member: Map<string, number>,
  memberWords: number,
  global: Map<string, number>,
  globalWords: number,
  limit = 3,
): Array<{ phrase: string; count: number; ratio: number }> {
  if (memberWords === 0 || globalWords === 0) return [];
  const out: Array<{ phrase: string; count: number; ratio: number }> = [];
  for (const [tok, count] of member) {
    if (count < MIN_USES || tok.length < MIN_LEN || STOPWORDS.has(tok)) continue;
    const globalCount = global.get(tok) ?? count; // token may have been pruned globally
    const ratio = (count / memberWords) / (globalCount / globalWords);
    out.push({ phrase: tok, count, ratio: Math.round(ratio * 10) / 10 });
  }
  return out.sort((a, b) => b.ratio - a.ratio).slice(0, limit);
}
