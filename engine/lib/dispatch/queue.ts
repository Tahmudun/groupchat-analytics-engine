import { sql } from '@/lib/db/client';
import { withDbRetry } from '@/lib/sentiment/run';
import type { SentimentInput } from '@/lib/sentiment/contract';

export const ELIGIBLE_MIN_MESSAGES = 500; // tier-list pool → classify these mentions first
const MAX_BATCH_ATTEMPTS = 3;             // then drain to neutral so the queue empties
const FETCH_MULTIPLE = 6;                 // page size = biggest lane batch × this

export type WorkScope = {
  /** When set, only this model's missing cache rows count as pending. */
  modelVersion?: string;
  /** Include every mention target in messages at or after this timestamp. */
  newMessagesSince?: Date;
  /** Also include historical targets matched by aliases created after this timestamp. */
  aliasesSince?: Date;
  /** Treat confidence-0 neutral drains as pending so a later pass can repair them. */
  retryDrains?: boolean;
  /** Select only existing confidence-0 rows (never uncached model rows). */
  drainsOnly?: boolean;
};

/**
 * Resumable queue backed by the DB cache. Normal dispatch shares one instance
 * across lanes (any model_version counts); ensemble dispatch gives each lane
 * a model-specific instance over the same bounded target scope.
 */
export class WorkQueue {
  private inflight = new Set<string>();
  // In retry-drains mode, a confidence-0 row remains DB-pending even after
  // this run exhausts its attempts. Keep it out of this process's refills so
  // the worker terminates and an operator can diagnose it instead of looping.
  private failedThisRun = new Set<string>();
  private buffer: Array<SentimentInput & { has_eligible: boolean }> = [];
  private attempts = new Map<string, number>();
  private exhausted = false;
  private fetching: Promise<void> | null = null;

  constructor(
    private readonly chatId: string,
    private readonly maxBatch: number,
    private limitMessages = Number.MAX_SAFE_INTEGER,
    private readonly scope: WorkScope = {},
  ) {}

  private async refillBuffer(): Promise<void> {
    // serialize refills so parallel lanes don't double-fetch the same rows
    this.fetching ??= (async () => {
      try {
        const excluded = [...this.inflight, ...this.failedThisRun];
        const modelVersion = this.scope.modelVersion ?? null;
        const newMessagesSince = this.scope.newMessagesSince ?? null;
        const aliasesSince = this.scope.aliasesSince ?? null;
        const retryDrains = this.scope.retryDrains ?? false;
        const drainsOnly = this.scope.drainsOnly ?? false;
        const rows = await withDbRetry(() => sql`
          WITH eligible AS (
            -- Ingest keeps this tiny materialized view current. Re-aggregating
            -- the million-row messages table on every queue refill was the
            -- dispatcher's largest avoidable database cost.
            SELECT sender FROM sender_message_counts
            WHERE msg_count >= ${ELIGIBLE_MIN_MESSAGES}
          )
          SELECT m.id AS message_id, m.content,
                 jsonb_agg(DISTINCT jsonb_build_object('member_username', mm.member_username, 'alias_matched', mm.alias_matched)) AS targets,
                 bool_or(mm.member_username IN (SELECT sender FROM eligible)) AS has_eligible
          FROM message_mentions mm
          JOIN messages m ON m.id = mm.message_id
          WHERE mm.chat_id = ${this.chatId}
            AND m.id <> ALL(${excluded}::text[])
            AND (
              (${modelVersion}::text IS NULL AND NOT EXISTS (
                SELECT 1 FROM mention_sentiments s
                WHERE s.message_id = mm.message_id AND s.member_username = mm.member_username
              ))
              OR
              (${modelVersion}::text IS NOT NULL AND (
                (${drainsOnly} AND EXISTS (
                  SELECT 1 FROM mention_sentiments s
                  WHERE s.message_id = mm.message_id AND s.member_username = mm.member_username
                    AND s.model_version = ${modelVersion} AND s.confidence = 0
                ))
                OR
                (${!drainsOnly} AND NOT EXISTS (
                  SELECT 1 FROM mention_sentiments s
                  WHERE s.message_id = mm.message_id AND s.member_username = mm.member_username
                    AND s.model_version = ${modelVersion}
                    AND (${!retryDrains} OR s.confidence > 0)
                ))
              ))
            )
            AND (
              (${newMessagesSince}::timestamptz IS NULL AND ${aliasesSince}::timestamptz IS NULL)
              OR (${newMessagesSince}::timestamptz IS NOT NULL AND m.timestamp >= ${newMessagesSince})
              OR (${aliasesSince}::timestamptz IS NOT NULL AND EXISTS (
                SELECT 1 FROM member_aliases ma
                WHERE ma.chat_id = mm.chat_id
                  AND ma.member_username = mm.member_username
                  AND lower(ma.alias) = lower(mm.alias_matched)
                  AND ma.created_at >= ${aliasesSince}
              ))
            )
          GROUP BY m.id, m.content
          ORDER BY bool_or(mm.member_username IN (SELECT sender FROM eligible)) DESC, m.id
          LIMIT ${this.maxBatch * FETCH_MULTIPLE}`);
        this.buffer = rows as unknown as typeof this.buffer;
        if (this.buffer.length === 0) this.exhausted = true;
      } finally {
        this.fetching = null;
      }
    })();
    await this.fetching;
  }

  /** Next batch for a lane, or null when the queue is drained. */
  async next(batchSize: number): Promise<SentimentInput[] | null> {
    if (this.limitMessages <= 0) return null;
    if (this.buffer.length < batchSize && !this.exhausted) await this.refillBuffer();
    const take = Math.min(batchSize, this.limitMessages, this.buffer.length);
    if (take === 0) return null;
    const batch = this.buffer.splice(0, take);
    this.limitMessages -= take;
    for (const b of batch) this.inflight.add(b.message_id);
    return batch.map(({ has_eligible: _e, ...input }) => input);
  }

  /** Batch fully stored — clear in-flight (cache now excludes these rows). */
  complete(batch: SentimentInput[]): void {
    for (const b of batch) this.inflight.delete(b.message_id);
  }

  /** Release without a strike — for 429s/shutdown, where the batch isn't at fault. */
  release(batch: SentimentInput[]): void {
    for (const b of batch) this.inflight.delete(b.message_id);
    this.exhausted = false;
  }

  /**
   * Failed-retriable: release the messages so a later fetch re-serves the
   * uncached pairs. Returns the messages that struck out (>= MAX_BATCH_ATTEMPTS)
   * — the caller must neutral-drain those instead of requeueing forever.
   */
  requeue(batch: SentimentInput[]): SentimentInput[] {
    const drained: SentimentInput[] = [];
    for (const b of batch) {
      this.inflight.delete(b.message_id);
      const n = (this.attempts.get(b.message_id) ?? 0) + 1;
      this.attempts.set(b.message_id, n);
      if (n >= MAX_BATCH_ATTEMPTS) {
        drained.push(b);
        this.failedThisRun.add(b.message_id);
      }
    }
    this.exhausted = false; // requeued work may exist beyond the current buffer
    return drained;
  }

  /** After new cache rows land, an "exhausted" queue may have fresh work. */
  reset(): void {
    this.exhausted = false;
  }
}
