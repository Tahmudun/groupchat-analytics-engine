/** Streaming text statistics for the recap compute pass. One instance
 *  consumes every real message once; memory bounded by periodic prune(). */

export type MemberTextStats = {
  tokens: Map<string, number>;
  words: number;
  messages: number;
  laughs: number;
  caps: number;
  profanity: number;
};

// Message counts as a laugh if any token starts with one of these, or the
// raw text contains a laugh emoji.
const LAUGH_PREFIXES = ['lmao', 'lmfao', 'lol', 'haha', 'jaja'];
const LAUGH_EMOJI = /[💀😭😂🤣]/u;
const PROFANITY = new Set(['fuck', 'fucking', 'shit', 'bitch', 'ass', 'wtf', 'damn', 'nigga']);

export function tokenize(content: string): string[] {
  return content
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

function isShouted(content: string): boolean {
  const letters = content.replace(/[^a-zA-Z]/g, '');
  if (letters.length < 8) return false;
  const upper = letters.replace(/[^A-Z]/g, '').length;
  return upper / letters.length >= 0.8;
}

export class TextTally {
  globalTokens = new Map<string, number>();
  perMember = new Map<string, MemberTextStats>();

  private memberStats(sender: string): MemberTextStats {
    let m = this.perMember.get(sender);
    if (!m) {
      m = { tokens: new Map(), words: 0, messages: 0, laughs: 0, caps: 0, profanity: 0 };
      this.perMember.set(sender, m);
    }
    return m;
  }

  add(sender: string, content: string): void {
    const m = this.memberStats(sender);
    const tokens = tokenize(content);
    m.messages += 1;
    m.words += tokens.length;
    if (tokens.some(t => LAUGH_PREFIXES.some(p => t.startsWith(p))) || LAUGH_EMOJI.test(content)) {
      m.laughs += 1;
    }
    if (isShouted(content)) m.caps += 1;
    for (const t of tokens) {
      if (PROFANITY.has(t)) m.profanity += 1;
      m.tokens.set(t, (m.tokens.get(t) ?? 0) + 1);
      this.globalTokens.set(t, (this.globalTokens.get(t) ?? 0) + 1);
    }
  }

  /** Drop tokens below minGlobal everywhere. Called every ~100k messages by
   *  the compute pass; a token pruned early can't become a catchphrase, which
   *  is fine — catchphrases need ≥15 member uses anyway. */
  prune(minGlobal = 3): void {
    const keep = new Set<string>();
    for (const [tok, n] of this.globalTokens) {
      if (n < minGlobal) this.globalTokens.delete(tok);
      else keep.add(tok);
    }
    for (const m of this.perMember.values()) {
      for (const tok of m.tokens.keys()) if (!keep.has(tok)) m.tokens.delete(tok);
    }
  }
}
