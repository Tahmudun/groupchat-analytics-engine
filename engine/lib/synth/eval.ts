import { sql } from '@/lib/db/client';
import { deriveLabel } from '@/lib/sentiment/contract';
import { INTENT_LABEL, INTENT_SCORE, type Intent } from './text';
import type { GroundTruth } from './export';

/**
 * Score the real pipeline against the generator's ground truth. Because the
 * simulator decided who every message was about and how it felt, the demo
 * chat doubles as a labelled benchmark for the two stages that are otherwise
 * only spot-checked on real data: mention resolution and LLM sentiment.
 *
 * Messages are matched on (timestamp_ms, content) — the same identity the
 * merge tool uses — so evaluation survives rename merges and dedup.
 */

export const ORACLE_VERSION = 'synthetic/oracle';

type Label = 'positive' | 'neutral' | 'negative';
const LABELS: Label[] = ['positive', 'neutral', 'negative'];

export type TruthPair = { key: string; member: string; alias: string; intent: Intent };
export type DbMention = { key: string; member: string; alias: string };
export type DbSentiment = { key: string; member: string; score: number; model: string; confidence: number };

export const messageKey = (ts: number | string, content: string) => `${ts}\u0000${content}`;

export function truthPairs(truth: GroundTruth): TruthPair[] {
  return truth.mentions.flatMap(m => m.targets.map(t => ({
    key: messageKey(m.ts, m.content), member: truth.members[t.targetId]!.finalName, alias: t.alias, intent: t.intent,
  })));
}

export type MentionEval = {
  truthPairs: number;
  foundPairs: number;
  truePositives: number;
  precision: number;
  recall: number;
  f1: number;
  /** Aliases behind false positives, most frequent first — collisions like "mayo" (the food). */
  falsePositiveAliases: Array<{ alias: string; count: number }>;
  falseNegativeAliases: Array<{ alias: string; count: number }>;
};

const round = (x: number) => Math.round(x * 1000) / 1000;

function tally(items: string[]): Array<{ alias: string; count: number }> {
  const m = new Map<string, number>();
  for (const i of items) m.set(i, (m.get(i) ?? 0) + 1);
  return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([alias, count]) => ({ alias, count }));
}

/** Pair-level precision/recall: one (message, member) pair counts once however many times it's matched. */
export function evaluateMentions(truth: TruthPair[], found: DbMention[]): MentionEval {
  const truthSet = new Map(truth.map(t => [`${t.key}\u0000${t.member}`, t]));
  const foundByPair = new Map<string, DbMention>();
  for (const f of found) if (!foundByPair.has(`${f.key}\u0000${f.member}`)) foundByPair.set(`${f.key}\u0000${f.member}`, f);
  let tp = 0;
  const fp: string[] = [];
  for (const [pair, f] of foundByPair) {
    if (truthSet.has(pair)) tp += 1;
    else fp.push(f.alias.toLowerCase());
  }
  const fn = [...truthSet.entries()].filter(([pair]) => !foundByPair.has(pair)).map(([, t]) => t.alias.toLowerCase());
  const precision = foundByPair.size ? tp / foundByPair.size : 0;
  const recall = truthSet.size ? tp / truthSet.size : 0;
  return {
    truthPairs: truthSet.size, foundPairs: foundByPair.size, truePositives: tp,
    precision: round(precision), recall: round(recall),
    f1: round(precision + recall ? (2 * precision * recall) / (precision + recall) : 0),
    falsePositiveAliases: tally(fp), falseNegativeAliases: tally(fn),
  };
}

export type SentimentEval = {
  model: string;
  /** Truth pairs this model classified (pairs the resolver missed can't be classified). */
  evaluated: number;
  coverage: number;
  accuracy: number;
  macroF1: number;
  /** Mean absolute error vs the intent's reference score. */
  mae: number;
  drains: number;
  /** confusion[truth][predicted] */
  confusion: Record<Label, Record<Label, number>>;
  /** Share of each intent classified to its expected label — e.g. how often playful roasts read as neutral. */
  byIntent: Record<Intent, { n: number; correct: number; accuracy: number }>;
};

export function evaluateSentiment(truth: TruthPair[], rows: DbSentiment[]): SentimentEval[] {
  const truthByPair = new Map(truth.map(t => [`${t.key}\u0000${t.member}`, t]));
  const models = [...new Set(rows.map(r => r.model))].sort();
  return models.map(model => {
    const confusion = Object.fromEntries(LABELS.map(a => [a, Object.fromEntries(LABELS.map(b => [b, 0]))])) as SentimentEval['confusion'];
    const byIntent = Object.fromEntries((Object.keys(INTENT_LABEL) as Intent[]).map(i => [i, { n: 0, correct: 0, accuracy: 0 }])) as SentimentEval['byIntent'];
    let n = 0, correct = 0, absErr = 0, drains = 0;
    for (const r of rows) {
      if (r.model !== model) continue;
      const t = truthByPair.get(`${r.key}\u0000${r.member}`);
      if (!t) continue; // a false-positive mention: no ground-truth sentiment to compare
      if (r.confidence === 0) { drains += 1; continue; } // unparseable cache marker, not a prediction
      const expected = INTENT_LABEL[t.intent];
      const predicted = deriveLabel(r.score);
      confusion[expected][predicted] += 1;
      byIntent[t.intent].n += 1;
      if (expected === predicted) { correct += 1; byIntent[t.intent].correct += 1; }
      absErr += Math.abs(r.score - INTENT_SCORE[t.intent]);
      n += 1;
    }
    for (const i of Object.values(byIntent)) i.accuracy = round(i.n ? i.correct / i.n : 0);
    const f1s = LABELS.map(l => {
      const tp = confusion[l][l];
      const predicted = LABELS.reduce((s, x) => s + confusion[x][l], 0);
      const actual = LABELS.reduce((s, x) => s + confusion[l][x], 0);
      const p = predicted ? tp / predicted : 0;
      const rc = actual ? tp / actual : 0;
      return p + rc ? (2 * p * rc) / (p + rc) : 0;
    });
    return {
      model, evaluated: n, coverage: round(truth.length ? (n + drains) / truth.length : 0),
      accuracy: round(n ? correct / n : 0), macroF1: round(f1s.reduce((a, b) => a + b, 0) / LABELS.length),
      mae: round(n ? absErr / n : 0), drains, confusion, byIntent,
    };
  });
}

// --- DB loaders ------------------------------------------------------------

export async function loadMentions(chatId: string): Promise<DbMention[]> {
  const rows = await sql`
    SELECT m.timestamp_ms, m.content, mm.member_username, mm.alias_matched
    FROM message_mentions mm JOIN messages m ON m.id = mm.message_id
    WHERE mm.chat_id = ${chatId}`;
  return rows.map(r => ({ key: messageKey(r.timestamp_ms as string, r.content as string), member: r.member_username as string, alias: r.alias_matched as string }));
}

export async function loadSentiments(chatId: string): Promise<DbSentiment[]> {
  const rows = await sql`
    SELECT m.timestamp_ms, m.content, s.member_username, s.sentiment_score, s.model_version, s.confidence
    FROM mention_sentiments s JOIN messages m ON m.id = s.message_id
    WHERE s.chat_id = ${chatId}`;
  return rows.map(r => ({
    key: messageKey(r.timestamp_ms as string, r.content as string), member: r.member_username as string,
    score: r.sentiment_score as number, model: r.model_version as string, confidence: r.confidence as number,
  }));
}

/**
 * DEV ONLY: write ground-truth sentiment (intent score + noise) for every
 * extracted mention, so the downstream pipeline can be exercised without LLM
 * keys. Never ship these rows as the demo's analysis — the deployed demo runs
 * the real LLM dispatch, and `synth eval` excludes this version by default.
 */
export async function writeOracleSentiments(chatId: string, truth: TruthPair[], seed = 7): Promise<number> {
  const truthByPair = new Map(truth.map(t => [`${t.key}\u0000${t.member}`, t]));
  const rows = await sql`
    SELECT DISTINCT mm.message_id, mm.member_username, m.timestamp_ms, m.content
    FROM message_mentions mm JOIN messages m ON m.id = mm.message_id
    WHERE mm.chat_id = ${chatId}`;
  let state = seed;
  const noise = () => { state = (state * 1103515245 + 12345) % 2147483648; return (state / 2147483648 - 0.5) * 0.2; };
  const out = rows.map(r => {
    const t = truthByPair.get(`${messageKey(r.timestamp_ms as string, r.content as string)}\u0000${r.member_username as string}`);
    const score = Math.max(-1, Math.min(1, (t ? INTENT_SCORE[t.intent] : 0) + noise()));
    return {
      message_id: r.message_id as string, member_username: r.member_username as string, chat_id: chatId,
      sentiment_score: score, sentiment_label: deriveLabel(score), confidence: 0.9, model_version: ORACLE_VERSION,
    };
  });
  for (let i = 0; i < out.length; i += 1000) {
    const batch = out.slice(i, i + 1000);
    await sql`
      INSERT INTO mention_sentiments ${sql(batch, 'message_id', 'member_username', 'chat_id', 'sentiment_score', 'sentiment_label', 'confidence', 'model_version')}
      ON CONFLICT (message_id, member_username, model_version) DO UPDATE SET
        sentiment_score = EXCLUDED.sentiment_score, sentiment_label = EXCLUDED.sentiment_label, computed_at = now()`;
  }
  return out.length;
}

export async function clearOracleSentiments(chatId: string): Promise<number> {
  const r = await sql`DELETE FROM mention_sentiments WHERE chat_id = ${chatId} AND model_version = ${ORACLE_VERSION}`;
  return r.count;
}
