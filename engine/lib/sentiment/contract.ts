import { z } from 'zod';

// Compressed classification contract (2026-07-04): the model returns ONLY
// [batch_index, "member_username", score] triples. Labels and confidence are
// derived client-side — response tokens were ~60% of the old contract's cost.

export type SentimentInput = {
  message_id: string;
  content: string;
  targets: Array<{ member_username: string; alias_matched: string }>;
};

export type SentimentResult = {
  message_id: string;
  member_username: string;
  sentiment_score: number;
  sentiment_label: 'positive' | 'neutral' | 'negative';
  confidence: number;
};

export const TRUNCATE_CHARS = 300;   // longer messages rarely change target sentiment
export const DEFAULT_BATCH_SIZE = 25; // per-provider override in providers config
export const POSITIVE_THRESHOLD = 0.15;
export const NEGATIVE_THRESHOLD = -0.15;

export function deriveLabel(score: number): SentimentResult['sentiment_label'] {
  if (score >= POSITIVE_THRESHOLD) return 'positive';
  if (score <= NEGATIVE_THRESHOLD) return 'negative';
  return 'neutral';
}

export function truncateContent(content: string): string {
  return content.length <= TRUNCATE_CHARS ? content : content.slice(0, TRUNCATE_CHARS) + '…';
}

export function buildTriplePrompt(batch: SentimentInput[]): string {
  const items = batch.map((b, i) => {
    const targets = b.targets.map(t =>
      t.alias_matched.toLowerCase() === t.member_username.toLowerCase()
        ? t.member_username
        : `${t.member_username} (as "${t.alias_matched}")`,
    ).join(', ');
    return `${i + 1}. ${JSON.stringify(truncateContent(b.content))} → targets: ${targets}`;
  }).join('\n');

  return `Messages from a close-knit friend-group chat. Slang, profanity and roasting are normal and often AFFECTIONATE ("you're so washed 💀" between friends is usually playful). Score the sentiment expressed TOWARD each named target — not the message's overall tone. Scale: -1.0 hostile to 1.0 loving; playful roasts ≈ -0.1 to 0.2, genuine praise ≥ 0.5, real hostility ≤ -0.5.
Anchors: "bro carried the whole game" → 0.7 · "this idiot lmaooo 💀" (affectionate) → 0.1 · "wren would lose this too" (roast) → -0.1 · "actually f you, im done" → -0.8.

${items}

Return ONLY a JSON array of [index, "target_username", score] triples — exactly one triple per (index, target) pair listed above, no other text. If a top-level object is required, use {"r": [...that array...]}.`;
}

export const REPAIR_INSTRUCTION =
  '\n\nYour previous reply was not valid. Return only the JSON array of [index, "target_username", score] triples, one per (index, target) pair, and nothing else.';

const Triple = z.tuple([
  z.union([z.string(), z.number()]).transform(Number),
  z.string(),
  z.number(),
]);

export type ParsedResponse = {
  results: SentimentResult[];
  /** expected (index, target) pairs the response did not cover */
  missing: Array<{ index: number; member_username: string }>;
};

/**
 * Tolerant parse: accepts a bare array of triples, or an object whose first
 * array-valued property holds them (json_object mode can't emit bare arrays).
 * Out-of-range scores are clamped; unknown indexes/targets are dropped.
 */
/** Parse raw, falling back to the outermost {...} or [...] substring — some
 *  models (reasoning models especially) wrap the JSON in prose. */
function lenientJsonParse(raw: string): unknown {
  const candidates = [raw];
  for (const [open, close] of [['{', '}'], ['[', ']']] as const) {
    const a = raw.indexOf(open);
    const b = raw.lastIndexOf(close);
    if (a !== -1 && b > a) candidates.push(raw.slice(a, b + 1));
  }
  for (const c of candidates) {
    try {
      return JSON.parse(c);
    } catch { /* next candidate */ }
  }
  return null;
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '');

function editDistance(a: string, b: string): number {
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0]!;
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const next = Math.min(prev[j]! + 1, prev[j - 1]! + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = prev[j]!;
      prev[j] = next;
    }
  }
  return prev[b.length]!;
}

/**
 * Match a model-echoed target against a message's expected targets.
 * Cascade (2026-07-07, from live mistral/gemini failures): exact username →
 * normalized username → normalized alias → fuzzy (≤2 edits on normalized
 * forms, unique winner only). Models echo the prompt's `username (as "alias")`
 * label verbatim, echo just the alias, or garble decorated names
 * ("erin ✨" for "Aren ✨") — any of which used to fail the batch.
 */
function matchTargets(targets: SentimentInput['targets'], echoRaw: string): SentimentInput['targets'] {
  const echo = echoRaw.replace(/\s*\(as\s+"[^"]*"\)\s*$/, '');
  const ne = norm(echo);
  const direct = targets.find(t => t.member_username.toLowerCase() === echo.toLowerCase())
    ?? targets.find(t => norm(t.member_username) === ne)
    ?? targets.find(t => norm(t.alias_matched) === ne);
  if (direct) return [direct];

  // Some models collapse or expand a person-like phrase even when the prompt
  // lists the exact DB targets: "Mary" + "Kate" comes back as "Mary Kate";
  // "Huey, Dewey, and Louie" comes back as separate Huey/Dewey/Louie triples; and
  // decorated "Fiona." may come back as "Fiona Byrne". Match exact word
  // components only within this message's expected targets. Multiple matches
  // intentionally fan one combined-entity score to each listed target.
  const words = echo.toLowerCase().match(/[a-z0-9]+/g) ?? [];
  const usefulWords = new Set(words.filter(w => w.length >= 2 && !['and', 'the', 'as'].includes(w)));
  const componentMatches = targets.filter(t => {
    const forms = [t.member_username, t.alias_matched];
    return forms.some(form => {
      const normalized = norm(form);
      if (usefulWords.has(normalized)) return true;
      const components = form.toLowerCase().match(/[a-z0-9]+/g) ?? [];
      return components.some(w => w.length >= 2 && usefulWords.has(w) && words.length === 1);
    });
  });
  if (componentMatches.length > 0) {
    return [...new Map(componentMatches.map(t => [t.member_username, t])).values()];
  }
  const uniqueTargets = [...new Map(targets.map(t => [t.member_username, t])).values()];
  const soleSharesPrefix = uniqueTargets.length === 1 && [uniqueTargets[0]!.member_username, uniqueTargets[0]!.alias_matched]
    .some(form => norm(form).startsWith(ne) || ne.startsWith(norm(form)));
  if (ne.length > 0 && soleSharesPrefix) {
    // With one expected member, the index already identifies the pair. This
    // covers aggressive model shortening such as sole target "S S" echoed as
    // "S" while still refusing to guess between multi-target messages.
    return uniqueTargets;
  }
  if (ne.length < 3) return [];

  let best: { target: SentimentInput['targets'][number]; d: number } | undefined;
  let ambiguous = false;
  for (const t of targets) {
    const d = Math.min(editDistance(norm(t.member_username), ne), editDistance(norm(t.alias_matched), ne));
    if (d > 2) continue;
    if (!best || d < best.d) { best = { target: t, d }; ambiguous = false; }
    else if (d === best.d && t.member_username !== best.target.member_username) ambiguous = true;
  }
  return ambiguous || !best ? [] : [best.target];
}

export function parseTripleResponse(raw: string, batch: SentimentInput[]): ParsedResponse {
  const parsed = lenientJsonParse(raw);
  let arr: unknown[] = [];
  if (Array.isArray(parsed)) {
    // bare array — could also be a single triple like [1, "user", 0.5]
    arr = Triple.safeParse(parsed).success ? [parsed] : parsed;
  } else if (parsed && typeof parsed === 'object') {
    const firstArray = Object.values(parsed).find(Array.isArray);
    if (firstArray) arr = firstArray;
  }

  const triples = arr.flatMap(rowRaw => {
    const row = Triple.safeParse(rowRaw);
    return row.success ? [row.data] : [];
  });
  // Groq occasionally echoes the prompt's 1-based indexes as 0-based. Only
  // shift when a zero is present and every returned index fits the valid
  // 0..batch.length-1 range; mixed/out-of-range replies remain invalid.
  const zeroBased = triples.some(([index]) => index === 0)
    && triples.every(([index]) => Number.isInteger(index) && index >= 0 && index < batch.length);

  const seen = new Set<string>();
  const results: SentimentResult[] = [];
  for (const [indexRaw, target, scoreRaw] of triples) {
    if (!Number.isFinite(indexRaw)) continue;
    const index = indexRaw + (zeroBased ? 1 : 0);
    const input = batch[index - 1];
    if (!input) continue;
    const score = Math.max(-1, Math.min(1, scoreRaw));
    for (const match of matchTargets(input.targets, target)) {
      const key = `${index}:${match.member_username}`;
      if (seen.has(key)) continue;
      seen.add(key);
      results.push({
        message_id: input.message_id,
        member_username: match.member_username,
        sentiment_score: score,
        sentiment_label: deriveLabel(score),
        confidence: 1,
      });
    }
  }

  const missing: ParsedResponse['missing'] = [];
  batch.forEach((input, i) => {
    // a member can be mentioned under several aliases — one expected pair
    for (const member of new Set(input.targets.map(t => t.member_username))) {
      if (!seen.has(`${i + 1}:${member}`)) {
        missing.push({ index: i + 1, member_username: member });
      }
    }
  });
  return { results, missing };
}

export type BatchOutcome =
  | { ok: true; results: SentimentResult[]; repaired: boolean }
  | { ok: false; reason: string; partial: SentimentResult[] };

/**
 * One classify attempt plus one repair retry on malformed/incomplete output.
 * Still-incomplete batches come back ok:false — the caller requeues them
 * (failed-retriable); partial results are valid and safe to store.
 */
export async function classifyBatchWithRepair(
  completeJson: (prompt: string) => Promise<string>,
  batch: SentimentInput[],
): Promise<BatchOutcome> {
  const prompt = buildTriplePrompt(batch);
  const first = parseTripleResponse(await completeJson(prompt), batch);
  if (first.missing.length === 0) return { ok: true, results: first.results, repaired: false };

  const second = parseTripleResponse(await completeJson(prompt + REPAIR_INSTRUCTION), batch);
  const best = second.missing.length < first.missing.length ? second : first;
  if (best.missing.length === 0) return { ok: true, results: best.results, repaired: true };
  return {
    ok: false,
    reason: `response missing ${best.missing.length}/${batch.reduce((n, b) => n + b.targets.length, 0)} (index,target) pairs after repair`,
    partial: best.results,
  };
}

/** Last-resort fill so a persistently failing batch can drain instead of looping forever. */
export function neutralFill(batch: SentimentInput[], covered: SentimentResult[]): SentimentResult[] {
  const seen = new Set(covered.map(r => `${r.message_id}:${r.member_username}`));
  const fill: SentimentResult[] = [];
  for (const input of batch) {
    for (const t of input.targets) {
      const key = `${input.message_id}:${t.member_username}`;
      if (!seen.has(key)) {
        seen.add(key); // a member can appear as two aliases — one fill row, not two
        fill.push({ message_id: input.message_id, member_username: t.member_username, sentiment_score: 0, sentiment_label: 'neutral', confidence: 0 });
      }
    }
  }
  return fill;
}
