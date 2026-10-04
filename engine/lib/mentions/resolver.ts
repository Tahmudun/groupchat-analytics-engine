import { levenshtein } from './fuzzy';
import { STOPWORDS } from './stopwords';
import { sql } from '@/lib/db/client';

export type AliasEntry = { alias: string; member_username: string; alias_type: string };
export type Mention = {
  member_username: string;
  alias_matched: string;
  confidence: number;
  offset_in_message: number;
};

// 2026-07-07 live-data lesson: 5–7 char fuzzy matching flooded the queue with
// dictionary-word collisions the moment new members with word-like names
// joined (finna→"Fiona.", every→"Avery", christmas→"christa",
// bastard→"Batara", android→"Andri"). Real typo catches were almost all long
// handles (pixel_haze42o→pixel_haze420). Fuzzy is now long-tokens-only,
// single-edit-only.
const FUZZY_MIN_TOKEN = 8;
const FUZZY_MAX_DIST = 1;
const MIN_ALIAS_LEN = 3;

/** 'Fiona.' → 'fiona', 'nadia🍰' → 'nadia', 'Casper 😨' → 'casper' — the form
 *  people actually type. Returns '' when nothing alphanumeric remains. */
function strippedVariant(lower: string): string {
  return lower.replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
}

/** Live-data lesson: members named "A", "Him", or "tears" cannot be
 *  mentionable by that string — it flags a third of the chat. */
function usableAlias(lower: string): boolean {
  if (lower.length < MIN_ALIAS_LEN) return false;
  if (STOPWORDS.has(lower)) return false;
  if (!/[a-z0-9]/.test(lower)) return false; // pure punctuation like ':))'
  return true;
}

export class MentionResolver {
  private exact = new Map<string, AliasEntry>();          // lowercased alias -> entry
  private fuzzables: Array<{ lower: string; entry: AliasEntry }> = [];
  private multiWord: Array<{ lower: string; entry: AliasEntry }> = [];

  constructor(aliases: AliasEntry[], blocklist: string[] = []) {
    const blocked = new Set(blocklist.map(b => b.toLowerCase()));
    const register = (lower: string, entry: AliasEntry, fuzzable: boolean) => {
      if (blocked.has(lower)) return;
      if (lower.includes(' ')) {
        // multi-word aliases are inherently specific; only length-gate them
        if (lower.length >= MIN_ALIAS_LEN) this.multiWord.push({ lower, entry });
        return;
      }
      if (!usableAlias(lower)) return;
      if (!this.exact.has(lower)) this.exact.set(lower, entry);
      if (fuzzable && lower.length >= FUZZY_MIN_TOKEN) this.fuzzables.push({ lower, entry });
    };
    for (const entry of aliases) {
      const lower = entry.alias.toLowerCase();
      register(lower, entry, true);
      // Decorated names ('Fiona.', 'nadia🍰', 'Casper 😨') also match the way
      // people actually type them. Exact-only: fuzzing a synthesized variant
      // would reintroduce the collision problem.
      const stripped = strippedVariant(lower);
      if (stripped && stripped !== lower) register(stripped, entry, false);
    }
  }

  static async forChat(chatId: string): Promise<MentionResolver> {
    const { loadChatConfig } = await import('@/lib/config/load');
    const config = await loadChatConfig(chatId);
    const rows = await sql`
      SELECT alias, member_username, alias_type FROM member_aliases WHERE chat_id = ${chatId}`;
    return new MentionResolver(rows as unknown as AliasEntry[], config.aliasBlocklist ?? []);
  }

  findMentions(messageText: string): Mention[] {
    const mentions: Mention[] = [];
    const lowerText = messageText.toLowerCase();

    // Multi-word aliases: substring scan with word-boundary guards.
    for (const { lower, entry } of this.multiWord) {
      let from = 0;
      while (true) {
        const idx = lowerText.indexOf(lower, from);
        if (idx === -1) break;
        const before = idx === 0 || !/\w/.test(lowerText[idx - 1]!);
        const afterIdx = idx + lower.length;
        const after = afterIdx >= lowerText.length || !/\w/.test(lowerText[afterIdx]!);
        if (before && after) {
          mentions.push({ member_username: entry.member_username, alias_matched: entry.alias, confidence: 1, offset_in_message: idx });
        }
        from = idx + lower.length;
      }
    }

    // Single tokens: exact first, then banded fuzzy.
    const tokenRe = /[\w.]+/g;
    let match: RegExpExecArray | null;
    while ((match = tokenRe.exec(lowerText)) !== null) {
      const token = match[0];
      const offset = match.index;
      // "aren't" tokenizes as "aren" + "t" — a negation contraction, not a
      // mention of member "Aren". Possessives ('s) keep the base word and
      // still count. Both apostrophe forms: ' and ’.
      const tail = lowerText.slice(offset + token.length, offset + token.length + 3);
      if (/^['’]t(?!\w)/.test(tail)) continue;
      // exact-map keys are single tokens by construction (multi-word aliases
      // live in multiWord) — a hit here may still carry a multi-word original
      // alias via its stripped variant ('casper' for 'Casper 😨').
      const exactHit = this.exact.get(token);
      if (exactHit) {
        mentions.push({ member_username: exactHit.member_username, alias_matched: exactHit.alias, confidence: 1, offset_in_message: offset });
        continue;
      }
      if (token.length < FUZZY_MIN_TOKEN) continue;
      if (STOPWORDS.has(token)) continue; // "thanks" must not typo-match "thane"
      if (token.endsWith('s') && STOPWORDS.has(token.slice(0, -1))) continue; // "dudes"
      const maxDist = FUZZY_MAX_DIST;
      for (const { lower, entry } of this.fuzzables) {
        if (token[0] !== lower[0]) continue; // cheap false-positive guard: typos rarely mangle the first letter
        if (levenshtein(token, lower, maxDist) <= maxDist) {
          mentions.push({ member_username: entry.member_username, alias_matched: entry.alias, confidence: 0.7, offset_in_message: offset });
          break; // first fuzzable wins for this token
        }
      }
    }
    return mentions;
  }
}
