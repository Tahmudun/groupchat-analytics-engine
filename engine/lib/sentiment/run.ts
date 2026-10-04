import { sql } from '@/lib/db/client';
import { MentionResolver } from '@/lib/mentions/resolver';
import { pickEngine } from '@/lib/llm/engine';
import { withBackoff } from '@/lib/llm/groq';
import { chunk } from '@/lib/ingestion/pipeline';
import { classifyBatchWithRepair, neutralFill, DEFAULT_BATCH_SIZE, type SentimentInput } from './contract';

export type SentimentReport = { scanned: number; mentionMessages: number; classified: number; cached: number; failed: number };

const SCAN_PAGE = 5000;     // messages pulled from the DB per page
const MAX_BATCH_ATTEMPTS = 3; // failed-retriable batches drain to neutral after this

/**
 * Long rate-limit sleeps let Supabase/PgBouncer reset our idle socket, and the
 * postgres client surfaces that as ECONNRESET on the next query instead of
 * reconnecting transparently. Safe to retry blindly here: callers only pass
 * read-only or idempotent queries.
 */
export async function withDbRetry<T>(fn: () => Promise<T>, attempts = 3): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (attempt >= attempts) throw err;
      await new Promise(res => setTimeout(res, 2000 * attempt));
    }
  }
}

/** Phase 1: extract mentions locally (cheap, idempotent via unique constraint). */
export async function extractMentions(chatId: string, report: SentimentReport, since?: Date): Promise<void> {
  const resolver = await MentionResolver.forChat(chatId);
  let lastId = '';
  while (true) {
    const rows = await sql`
      SELECT id, content, sender FROM messages
      WHERE chat_id = ${chatId} AND message_type = 'message' AND content <> ''
        AND id > ${lastId}
        AND (${since ?? null}::timestamptz IS NULL OR timestamp >= ${since ?? null})
      ORDER BY id LIMIT ${SCAN_PAGE}`;
    if (rows.length === 0) break;
    lastId = rows[rows.length - 1]!.id as string;
    report.scanned += rows.length;

    const mentionRows: Array<{ chat_id: string; message_id: string; member_username: string; alias_matched: string; confidence: number; offset_in_message: number }> = [];
    for (const row of rows) {
      const mentions = resolver.findMentions(row.content as string)
        .filter(m => m.member_username !== row.sender); // self-mentions are noise
      if (mentions.length) report.mentionMessages += 1;
      for (const m of mentions) {
        mentionRows.push({ chat_id: chatId, message_id: row.id as string, ...m });
      }
    }
    for (const batch of chunk(mentionRows, 1000)) {
      await sql`
        INSERT INTO message_mentions ${sql(batch, 'chat_id', 'message_id', 'member_username', 'alias_matched', 'confidence', 'offset_in_message')}
        ON CONFLICT (message_id, member_username, offset_in_message) DO NOTHING`;
    }
  }
}

/** Fetch the next page of mention-messages with no cached sentiment (any model_version). */
export async function fetchPending(
  chatId: string,
  opts: { limit: number; fullRerun?: boolean; runStarted?: Date },
): Promise<SentimentInput[]> {
  const runStarted = opts.runStarted ?? new Date(0);
  const rows = await withDbRetry(() => sql`
    SELECT m.id AS message_id, m.content,
           jsonb_agg(DISTINCT jsonb_build_object('member_username', mm.member_username, 'alias_matched', mm.alias_matched)) AS targets
    FROM message_mentions mm
    JOIN messages m ON m.id = mm.message_id
    WHERE mm.chat_id = ${chatId}
      AND NOT EXISTS (
        SELECT 1 FROM mention_sentiments s
        WHERE s.message_id = mm.message_id AND s.member_username = mm.member_username
          AND (${!(opts.fullRerun ?? false)} OR s.computed_at >= ${runStarted}))
    GROUP BY m.id, m.content
    LIMIT ${opts.limit}`);
  return rows as unknown as SentimentInput[];
}

/** Store results; the upsert is idempotent so retrying after a socket reset is safe. */
export async function storeResults(
  chatId: string,
  modelVersion: string,
  results: Array<{ message_id: string; member_username: string; sentiment_score: number; sentiment_label: string; confidence: number }>,
): Promise<void> {
  if (results.length === 0) return;
  // one row per PK within the statement — Postgres rejects a multi-row upsert
  // that touches the same (message, member, version) twice
  const byPk = new Map(results.map(r => [`${r.message_id}:${r.member_username}`, r]));
  const rows = [...byPk.values()].map(r => ({ ...r, chat_id: chatId, model_version: modelVersion }));
  await withDbRetry(() => sql`
    INSERT INTO mention_sentiments ${sql(rows, 'message_id', 'member_username', 'chat_id', 'sentiment_score', 'sentiment_label', 'confidence', 'model_version')}
    ON CONFLICT (message_id, member_username, model_version) DO UPDATE SET
      sentiment_score = EXCLUDED.sentiment_score,
      sentiment_label = EXCLUDED.sentiment_label,
      confidence = EXCLUDED.confidence,
      computed_at = now()`);
}

/** Phase 2: LLM-classify mention messages not yet cached under any model version. */
async function classifyMentions(chatId: string, report: SentimentReport, opts: { fullRerun?: boolean; limit?: number; verbose?: boolean; batchSize?: number }): Promise<void> {
  const engine = await pickEngine();
  const limit = opts.limit ?? Number.MAX_SAFE_INTEGER;
  const batchSize = opts.batchSize ?? DEFAULT_BATCH_SIZE;
  // full-rerun semantics: rows classified BEFORE this run started count as
  // stale and get reclassified exactly once; rows written during this run
  // are excluded, so the loop terminates.
  const runStarted = new Date();
  const attempts = new Map<string, number>(); // message_id → failed batch attempts

  while (report.classified + report.failed < limit) {
    const pending = await fetchPending(chatId, { limit: Math.min(batchSize * 4, limit), fullRerun: opts.fullRerun, runStarted });
    if (pending.length === 0) break;

    for (const llmBatch of chunk(pending, batchSize)) {
      try {
        const outcome = await withBackoff(() => classifyBatchWithRepair(p => engine.completeJson(p), llmBatch));
        if (outcome.ok) {
          await storeResults(chatId, engine.name, outcome.results);
          report.classified += llmBatch.length;
          if (opts.verbose) console.log(`classified batch of ${llmBatch.length} via ${engine.name}${outcome.repaired ? ' (repaired)' : ''}`);
        } else {
          // failed-retriable: store the valid partial rows, requeue the rest by
          // just not caching them — fetchPending re-serves them next loop. After
          // MAX_BATCH_ATTEMPTS the leftovers drain to neutral confidence-0 rows.
          await storeResults(chatId, engine.name, outcome.partial);
          const strikes = llmBatch.map(b => {
            const n = (attempts.get(b.message_id) ?? 0) + 1;
            attempts.set(b.message_id, n);
            return n;
          });
          if (Math.min(...strikes) >= MAX_BATCH_ATTEMPTS) {
            await storeResults(chatId, engine.name, neutralFill(llmBatch, outcome.partial));
            report.failed += llmBatch.length;
            console.error(`batch drained to neutral after ${MAX_BATCH_ATTEMPTS} attempts: ${outcome.reason}`);
          } else {
            console.error(`batch failed-retriable (${llmBatch.length} messages): ${outcome.reason}`);
          }
        }
      } catch (err) {
        report.failed += llmBatch.length;
        console.error(`batch failed (${llmBatch.length} messages): ${err instanceof Error ? err.message : err}`);
      }
    }
  }
}

export async function runSentiment(
  chatId: string,
  opts: { fullRerun?: boolean; since?: Date; limit?: number; verbose?: boolean; batchSize?: number } = {},
): Promise<SentimentReport> {
  const report: SentimentReport = { scanned: 0, mentionMessages: 0, classified: 0, cached: 0, failed: 0 };
  await extractMentions(chatId, report, opts.since);
  const [cachedRow] = await sql`
    SELECT count(*)::int AS c FROM mention_sentiments WHERE chat_id = ${chatId}`;
  report.cached = cachedRow!.c as number;
  await classifyMentions(chatId, report, opts);
  return report;
}
