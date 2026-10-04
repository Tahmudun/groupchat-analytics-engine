import { sql } from '@/lib/db/client';

/**
 * "Likely duplicate" member pairs for the merge UI. Member usernames ARE the
 * Instagram display names, so a rename leaves two rows whose names differ only
 * by a trailing emoji / a word — exactly what pg_trgm similarity() scores high.
 * The admin still confirms every merge; this only surfaces candidates.
 */

export type RawSuggestionRow = {
  a: string;
  b: string;
  similarity: number;
  a_count: number;
  b_count: number;
};

export type MergeSuggestion = {
  members: string[];
  similarity: number;
  /** default canonical = the busier account (more real messages) */
  suggestedCanonical: string;
  counts: Record<string, number>;
};

/** Pure shaping of one DB row into a suggestion — canonical defaults to the
 *  member with more messages. Extracted so it's unit-testable without a DB. */
export function toSuggestion(row: RawSuggestionRow): MergeSuggestion {
  const suggestedCanonical = row.a_count >= row.b_count ? row.a : row.b;
  return {
    members: [row.a, row.b],
    similarity: Math.round(row.similarity * 1000) / 1000,
    suggestedCanonical,
    counts: { [row.a]: row.a_count, [row.b]: row.b_count },
  };
}

/** Active members whose display names are near-identical (trigram similarity
 *  ≥ threshold). Excludes 'removed' rows and the "Instagram User" pseudo-member. */
export async function findMergeSuggestions(
  chat: string,
  threshold = 0.4,
  limit = 50,
): Promise<MergeSuggestion[]> {
  const rows = await sql`
    SELECT m1.username AS a, m2.username AS b,
           similarity(m1.username, m2.username) AS similarity,
           coalesce(c1.msg_count, 0)::int AS a_count,
           coalesce(c2.msg_count, 0)::int AS b_count
    FROM members m1
    JOIN members m2
      ON m1.chat_id = m2.chat_id
     AND m1.username < m2.username
     AND m1.status <> 'removed' AND m2.status <> 'removed'
     AND m1.username NOT IN ('Instagram User') AND m2.username NOT IN ('Instagram User')
     AND similarity(m1.username, m2.username) >= ${threshold}
    LEFT JOIN sender_message_counts c1 ON c1.sender = m1.username
    LEFT JOIN sender_message_counts c2 ON c2.sender = m2.username
    WHERE m1.chat_id = ${chat}
    ORDER BY similarity DESC, (coalesce(c1.msg_count,0) + coalesce(c2.msg_count,0)) DESC
    LIMIT ${limit}`;
  return rows.map(r => toSuggestion(r as RawSuggestionRow));
}
