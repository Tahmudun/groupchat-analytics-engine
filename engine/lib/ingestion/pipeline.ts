import postgres from 'postgres';
import { sql } from '@/lib/db/client';
import { env } from '@/lib/env';
import { detectAdapter } from '@/lib/adapters/registry';
import { messageRowId } from './ids';
import type { NormalizedMessage } from '@/lib/adapters/base';

export type IngestReport = {
  parsed: number;
  inserted: number;
  deduped: number;
  reactionsInserted: number;
  reactionsDeduped: number;
  membersUpserted: number;
  errors: number;
};

export type IngestProgress = { phase: 'parsing' | 'finalizing'; parsed: number; inserted: number };

export function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

const BATCH = 1000;

async function flushBatch(batch: NormalizedMessage[], report: IngestReport): Promise<void> {
  const messageRows = batch.map(m => ({
    id: messageRowId(m.chat_id, m.platform_message_id),
    sender: m.sender_handle,
    timestamp_ms: m.timestamp_ms,
    timestamp: m.sent_at,
    content: m.content,
    media_type: m.media_type,
    message_type: m.message_type,
    chat_id: m.chat_id,
  }));
  const inserted = await sql`
    INSERT INTO messages ${sql(messageRows, 'id', 'sender', 'timestamp_ms', 'timestamp', 'content', 'media_type', 'message_type', 'chat_id')}
    ON CONFLICT (id) DO NOTHING`;
  report.inserted += inserted.count;
  report.deduped += messageRows.length - inserted.count;

  const reactionRows = batch.flatMap((m, i) =>
    m.reactions.map(r => ({ message_id: messageRows[i]!.id, reactor: r.actor, emoji: r.emoji })),
  );
  for (const rBatch of chunk(reactionRows, BATCH)) {
    const r = await sql`
      INSERT INTO reactions ${sql(rBatch, 'message_id', 'reactor', 'emoji')}
      ON CONFLICT (message_id, reactor, emoji) DO NOTHING`;
    report.reactionsInserted += r.count;
    report.reactionsDeduped += rBatch.length - r.count;
  }
}

async function upsertMembers(chatId: string, senders: Set<string>, report: IngestReport): Promise<void> {
  const rows = [...senders].map(username => ({ username, chat_id: chatId }));
  for (const batch of chunk(rows, BATCH)) {
    const r = await sql`
      INSERT INTO members ${sql(batch, 'username', 'chat_id')}
      ON CONFLICT (username) DO NOTHING`;
    report.membersUpserted += r.count;
  }
  // Every member's handle is automatically an alias (spec §4).
  for (const batch of chunk(rows, BATCH)) {
    const aliasRows = batch.map(b => ({
      chat_id: b.chat_id, member_username: b.username, alias: b.username, alias_type: 'handle',
    }));
    await sql`
      INSERT INTO member_aliases ${sql(aliasRows, 'chat_id', 'member_username', 'alias', 'alias_type')}
      ON CONFLICT (chat_id, member_username, alias) DO NOTHING`;
  }
  // Site convention (2026-04-27 backfill): members with zero real messages —
  // reaction-only actors, add/remove targets — are status='removed' so they
  // stay out of dropdowns, the Members tab, and counts.
  await sql`
    UPDATE members m SET status = 'removed', updated_at = now()
    WHERE m.chat_id = ${chatId} AND m.status = 'unrecognized'
      AND NOT EXISTS (
        SELECT 1 FROM messages msg
        WHERE msg.sender = m.username AND msg.chat_id = ${chatId} AND msg.message_type = 'message')`;
}

/** Recompute the site_stats singleton exactly like search-engine/backend/db.py:
 *  member_count is DISTINCT senders of real messages (not a members-table count),
 *  and the date range covers real messages only. */
async function refreshSiteStats(): Promise<void> {
  await sql`
    INSERT INTO site_stats (singleton_id, total_messages, total_reactions, member_count, date_range_start, date_range_end, last_ingested_at)
    SELECT TRUE,
      count(*) FILTER (WHERE message_type = 'message'),
      (SELECT count(*) FROM reactions),
      count(DISTINCT sender) FILTER (WHERE message_type = 'message'),
      min(timestamp) FILTER (WHERE message_type = 'message'),
      max(timestamp) FILTER (WHERE message_type = 'message'),
      now()
    FROM messages
    ON CONFLICT (singleton_id) DO UPDATE SET
      total_messages = EXCLUDED.total_messages,
      total_reactions = EXCLUDED.total_reactions,
      member_count = EXCLUDED.member_count,
      date_range_start = EXCLUDED.date_range_start,
      date_range_end = EXCLUDED.date_range_end,
      last_ingested_at = EXCLUDED.last_ingested_at`;
}

/** The search frontend reads materialized views (2026-07-07 migration in
 *  search-engine/backend/migrations/) instead of aggregating 900k+ rows per
 *  request — live aggregates blew the anon role's 3s statement_timeout. The
 *  views only go stale at ingest, so every ingest path must refresh them.
 *  REFRESH CONCURRENTLY and VACUUM can't run inside a transaction, and the
 *  reaction-count rebuild outlives the 2min session default, so this uses a
 *  dedicated single connection with statement_timeout disabled. */
async function refreshSearchCaches(): Promise<void> {
  const maint = postgres(env.DATABASE_URL, {
    max: 1,
    keep_alive: 30,
    onnotice: () => {},
  });
  try {
    // the Supabase pooler drops statement_timeout from the startup packet —
    // an explicit SET is the only form that sticks (verified 2026-07-07)
    await maint`SET statement_timeout = 0`;
    // weekly_stats/member_costars (FLIX home + show pages) also read
    // message-derived aggregates, so ingest refreshes them too.
    for (const view of ['sender_message_counts', 'message_reaction_counts', 'weekly_stats', 'weekly_stats_v2', 'member_costars']) {
      await maint.unsafe(`REFRESH MATERIALIZED VIEW CONCURRENTLY ${view}`);
      await maint.unsafe(`VACUUM ANALYZE ${view}`);
    }
  } finally {
    await maint.end();
  }
}

export async function ingestArchive(
  chatId: string,
  inputPath: string,
  opts: { dryRun?: boolean; onProgress?: (p: IngestProgress) => void } = {},
): Promise<IngestReport> {
  const [chat] = await sql`SELECT id FROM chats WHERE id = ${chatId}`;
  if (!chat) throw new Error(`Unknown chat '${chatId}' — create it first (see chats table)`);

  const adapter = await detectAdapter(inputPath);
  const report: IngestReport = {
    parsed: 0, inserted: 0, deduped: 0,
    reactionsInserted: 0, reactionsDeduped: 0, membersUpserted: 0, errors: 0,
  };
  const emit = (phase: IngestProgress['phase']) =>
    opts.onProgress?.({ phase, parsed: report.parsed, inserted: report.inserted });
  const senders = new Set<string>();
  let batch: NormalizedMessage[] = [];

  for await (const msg of adapter.parseArchive(inputPath, chatId)) {
    report.parsed += 1;
    senders.add(msg.sender_handle);
    for (const r of msg.reactions) senders.add(r.actor);
    if (opts.dryRun) continue;
    batch.push(msg);
    if (batch.length >= BATCH) {
      await flushBatch(batch, report);
      batch = [];
      emit('parsing');
    }
  }
  if (!opts.dryRun) {
    if (batch.length) await flushBatch(batch, report);
    emit('finalizing');
    await upsertMembers(chatId, senders, report);
    await refreshSiteStats();
    // Existing project rule: stale planner stats cause search timeouts.
    await sql.unsafe('ANALYZE messages');
    await sql.unsafe('ANALYZE reactions');
    await refreshSearchCaches();
  }
  return report;
}
