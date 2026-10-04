import postgres from 'postgres';
import type { TransactionSql } from 'postgres';
import { sql } from '@/lib/db/client';
import { env } from '@/lib/env';

/**
 * Member merge — the "sender name drift" fix.
 *
 * Instagram stamps a member's *current* display name onto *all* their
 * historical messages in every export, so a rename (e.g. "Leo Martins 🦁" →
 * "Leo Martins ⚡") splits one person into two member rows with split message
 * counts, plus true-duplicate messages (same timestamp+content under both
 * names → different MD5 id → the DB thinks they're distinct).
 *
 * A merge picks one canonical member and folds N drift members into it,
 * pragmatically (see 2026-07-08 brainstorm): reassign the sender/reactor/
 * mention/sentiment/score references, collapse the true duplicates, record
 * the drift name as an alias, and mark the drift member row 'removed'. It does
 * NOT re-key the messages PK, so a *future* export after another rename can
 * re-introduce duplicates — but that's a one-click re-merge, not a risky PK
 * rewrite on the ~970k-row free-tier DB.
 */

export type MergePreview = {
  canonical: string;
  sources: string[];
  canonicalMessages: number;
  sourceMessages: Record<string, number>;
  /** real messages the merge will delete as duplicates (same ts+content) */
  duplicateMessages: number;
  /** canonical's real message count after the merge */
  totalAfter: number;
  reactionsReassigned: number;
  mentionsReassigned: number;
  sentimentsReassigned: number;
  scoreRowsDropped: number;
};

export type MergeResult = {
  canonical: string;
  sources: string[];
  duplicatesRemoved: number;
  messagesReassigned: number;
  reactionsReassigned: number;
  mentionsReassigned: number;
  sentimentsReassigned: number;
  scoreRowsDropped: number;
};

export type MergeProgress = { done: number; total: number; label: string };

/** Pure input validation — shared by API and tests. Returns an error string,
 *  or null if the merge request is well-formed. */
export function validateMergeInput(canonical: string, sources: string[]): string | null {
  const c = canonical?.trim();
  if (!c) return 'canonical member is required';
  if (!Array.isArray(sources) || sources.length === 0) return 'at least one source member is required';
  const cleaned = sources.map(s => s?.trim()).filter(Boolean);
  if (cleaned.length !== sources.length) return 'source members must be non-empty';
  if (cleaned.includes(c)) return 'the canonical member cannot also be a source';
  if (new Set(cleaned).size !== cleaned.length) return 'source members must be distinct';
  return null;
}

/** Read-only impact estimate for the confirmation step. */
export async function previewMerge(
  chat: string,
  canonical: string,
  sources: string[],
): Promise<MergePreview> {
  const all = [canonical, ...sources];

  const [canonRow] = await sql`
    SELECT count(*)::int AS n FROM messages
    WHERE chat_id = ${chat} AND sender = ${canonical} AND message_type = 'message'`;

  const perSource = await sql`
    SELECT sender, count(*)::int AS n FROM messages
    WHERE chat_id = ${chat} AND sender = ANY(${sources}) AND message_type = 'message'
    GROUP BY sender`;
  const sourceMessages: Record<string, number> = Object.fromEntries(sources.map(s => [s, 0]));
  for (const r of perSource) sourceMessages[r.sender as string] = r.n as number;

  // totalAfter = distinct (timestamp_ms, content) across every name being
  // merged. Everything beyond that is a true duplicate the merge removes.
  const [afterRow] = await sql`
    SELECT count(DISTINCT (timestamp_ms, content))::int AS n FROM messages
    WHERE chat_id = ${chat} AND sender = ANY(${all}) AND message_type = 'message'`;
  const totalAfter = (afterRow?.n as number) ?? 0;
  const totalBefore = (canonRow?.n as number ?? 0) + Object.values(sourceMessages).reduce((a, b) => a + b, 0);

  const [rxn] = await sql`SELECT count(*)::int AS n FROM reactions WHERE reactor = ANY(${sources})`;
  const [men] = await sql`
    SELECT count(*)::int AS n FROM message_mentions
    WHERE chat_id = ${chat} AND member_username = ANY(${sources})`;
  const [sen] = await sql`
    SELECT count(*)::int AS n FROM mention_sentiments
    WHERE chat_id = ${chat} AND member_username = ANY(${sources})`;
  const [scr] = await sql`
    SELECT count(*)::int AS n FROM member_scores
    WHERE chat_id = ${chat} AND member_username = ANY(${sources})`;

  return {
    canonical,
    sources,
    canonicalMessages: (canonRow?.n as number) ?? 0,
    sourceMessages,
    duplicateMessages: Math.max(0, totalBefore - totalAfter),
    totalAfter,
    reactionsReassigned: (rxn?.n as number) ?? 0,
    mentionsReassigned: (men?.n as number) ?? 0,
    sentimentsReassigned: (sen?.n as number) ?? 0,
    scoreRowsDropped: (scr?.n as number) ?? 0,
  };
}

/** Fold `sources` into `canonical` in one transaction, then refresh caches.
 *  Idempotent-ish: a source that no longer exists simply contributes nothing. */
export async function executeMerge(
  chat: string,
  canonical: string,
  sources: string[],
  onProgress?: (p: MergeProgress) => void,
): Promise<MergeResult> {
  const invalid = validateMergeInput(canonical, sources);
  if (invalid) throw new Error(invalid);

  const result = await sql.begin(tx => applyMerge(tx, chat, canonical, sources, onProgress));

  onProgress?.({ done: sources.length, total: sources.length + 1, label: 'refreshing caches…' });
  await refreshAfterMerge();
  onProgress?.({ done: sources.length + 1, total: sources.length + 1, label: 'done' });
  return result;
}

/** The transactional core of a merge — every write, no cache refresh. Split out
 *  from executeMerge so it can run against throwaway rows inside a rolled-back
 *  transaction for verification (see scripts/verify-merge). */
export async function applyMerge(
  tx: TransactionSql,
  chat: string,
  canonical: string,
  sources: string[],
  onProgress?: (p: MergeProgress) => void,
): Promise<MergeResult> {
  const totalSteps = sources.length + 1; // one per source + cache refresh
  const result: MergeResult = {
    canonical, sources,
    duplicatesRemoved: 0, messagesReassigned: 0, reactionsReassigned: 0,
    mentionsReassigned: 0, sentimentsReassigned: 0, scoreRowsDropped: 0,
  };

  // canonical must be a real member row before we point everything at it.
  const [c] = await tx`SELECT username FROM members WHERE chat_id = ${chat} AND username = ${canonical}`;
  if (!c) throw new Error(`canonical member '${canonical}' not found in '${chat}'`);

  let i = 0;
  for (const s of sources) {
    i += 1;
    onProgress?.({ done: i - 1, total: totalSteps, label: `merging ${s}…` });

    {
      // 1. Collapse true duplicates: drop the source copy of any message that
      //    already exists under the canonical name. Cascade removes that
      //    message's reactions/mentions/sentiments automatically. (Canonical
      //    grows as we go, so a later source also dedups against earlier ones.)
      const dupDeleted = await tx`
        DELETE FROM messages src
        WHERE src.chat_id = ${chat} AND src.sender = ${s}
          AND EXISTS (
            SELECT 1 FROM messages c
            WHERE c.chat_id = ${chat} AND c.sender = ${canonical}
              AND c.timestamp_ms = src.timestamp_ms AND c.content = src.content)
        RETURNING 1`;
      result.duplicatesRemoved += dupDeleted.length;

      // 2. Reassign the remaining messages. id (MD5 PK) is untouched; the
      //    surviving rows have ts+content not under canonical, so no PK clash.
      const moved = await tx`
        UPDATE messages SET sender = ${canonical}
        WHERE chat_id = ${chat} AND sender = ${s} RETURNING 1`;
      result.messagesReassigned += moved.length;

      // 3. Reactions carry the reactor's drift name too. Drop reactions that
      //    would collide with an existing canonical reaction (same msg+emoji),
      //    then reassign the rest. (reactions has no chat_id — single-chat DB.)
      await tx`
        DELETE FROM reactions r
        WHERE r.reactor = ${s}
          AND EXISTS (SELECT 1 FROM reactions c
                      WHERE c.message_id = r.message_id AND c.reactor = ${canonical} AND c.emoji = r.emoji)`;
      const rxn = await tx`UPDATE reactions SET reactor = ${canonical} WHERE reactor = ${s} RETURNING 1`;
      result.reactionsReassigned += rxn.length;

      // 4. Mentions (UNIQUE message_id, member, offset) — drop collisions, reassign.
      await tx`
        DELETE FROM message_mentions m
        WHERE m.chat_id = ${chat} AND m.member_username = ${s}
          AND EXISTS (SELECT 1 FROM message_mentions c
                      WHERE c.message_id = m.message_id AND c.member_username = ${canonical}
                        AND c.offset_in_message = m.offset_in_message)`;
      const men = await tx`
        UPDATE message_mentions SET member_username = ${canonical}
        WHERE chat_id = ${chat} AND member_username = ${s} RETURNING 1`;
      result.mentionsReassigned += men.length;

      // 5. Sentiments (PK message_id, member, model_version) — drop collisions, reassign.
      await tx`
        DELETE FROM mention_sentiments st
        WHERE st.chat_id = ${chat} AND st.member_username = ${s}
          AND EXISTS (SELECT 1 FROM mention_sentiments c
                      WHERE c.message_id = st.message_id AND c.member_username = ${canonical}
                        AND c.model_version = st.model_version)`;
      const sen = await tx`
        UPDATE mention_sentiments SET member_username = ${canonical}
        WHERE chat_id = ${chat} AND member_username = ${s} RETURNING 1`;
      result.sentimentsReassigned += sen.length;

      // 6. Scores are derived; drop the source's rows so no ghost show keeps a
      //    score. Canonical's rows are stale until a recompute (the UI nudges it).
      const scr = await tx`
        DELETE FROM member_scores WHERE chat_id = ${chat} AND member_username = ${s} RETURNING 1`;
      result.scoreRowsDropped += scr.length;

      // 7. Move the source's mention-aliases to canonical (skip name clashes),
      //    then record the source's display name itself as a canonical alias.
      await tx`
        UPDATE member_aliases a SET member_username = ${canonical}
        WHERE a.chat_id = ${chat} AND a.member_username = ${s}
          AND NOT EXISTS (SELECT 1 FROM member_aliases c
                          WHERE c.chat_id = ${chat} AND c.member_username = ${canonical} AND c.alias = a.alias)`;
      await tx`DELETE FROM member_aliases WHERE chat_id = ${chat} AND member_username = ${s}`;
      await tx`
        INSERT INTO member_aliases (chat_id, member_username, alias, alias_type)
        VALUES (${chat}, ${canonical}, ${s.trim().toLowerCase()}, 'real_name')
        ON CONFLICT (chat_id, member_username, alias) DO NOTHING`;

      // 8. Record the drift name in the canonical members row's display aliases.
      await tx`
        UPDATE members SET aliases = array_append(aliases, ${s}), updated_at = now()
        WHERE username = ${canonical} AND chat_id = ${chat} AND NOT (${s} = ANY(aliases))`;

      // 9. Retire the source member row (hidden everywhere, audit trail kept).
      await tx`
        UPDATE members SET status = 'removed', updated_at = now()
        WHERE username = ${s} AND chat_id = ${chat}`;
    }
  }
  return result;
}

/** site_stats + all four matviews (mirrors the ingest tail). REFRESH
 *  CONCURRENTLY / VACUUM can't run in a transaction, and the reaction-count
 *  rebuild outlives the 2min session default, so use a dedicated connection
 *  with statement_timeout disabled — the pooler drops the startup param, so an
 *  explicit SET is the only form that sticks (see supabase-free-tier lesson). */
async function refreshAfterMerge(): Promise<void> {
  const maint = postgres(env.DATABASE_URL, { max: 1, keep_alive: 30, onnotice: () => {} });
  try {
    await maint`SET statement_timeout = 0`;
    await maint`
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
        total_messages = EXCLUDED.total_messages, total_reactions = EXCLUDED.total_reactions,
        member_count = EXCLUDED.member_count, date_range_start = EXCLUDED.date_range_start,
        date_range_end = EXCLUDED.date_range_end, last_ingested_at = EXCLUDED.last_ingested_at`;
    await maint.unsafe('ANALYZE messages');
    await maint.unsafe('ANALYZE reactions');
    for (const view of ['sender_message_counts', 'message_reaction_counts', 'weekly_stats', 'weekly_stats_v2', 'member_costars']) {
      await maint.unsafe(`REFRESH MATERIALIZED VIEW CONCURRENTLY ${view}`);
      await maint.unsafe(`VACUUM ANALYZE ${view}`);
    }
  } finally {
    await maint.end();
  }
}
