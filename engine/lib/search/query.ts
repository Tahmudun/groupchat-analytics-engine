import { z } from 'zod';
import { sql } from '@/lib/db/client';

export const SearchBodySchema = z.object({
  query: z.string().max(500).optional(),
  filters: z.object({
    sender: z.string().optional(),
    date_from: z.string().date().optional(),
    date_to: z.string().date().optional(),
    message_type: z.string().optional(),
    has_media: z.boolean().optional(),
    media_type: z.string().optional(),
    min_reactions: z.number().int().min(0).optional(),
  }).optional(),
  sort: z.enum(['newest', 'oldest', 'relevance', 'most_reactions']).default('newest'),
  limit: z.number().int().min(1).max(100).default(25),
  cursor: z.string().nullish(),
});
export type SearchBody = z.infer<typeof SearchBodySchema>;

export type SearchResult = {
  id: string; sender: string; sent_at: string; content: string;
  media_type: string | null; reaction_count: number; rank: number;
};

export function encodeCursor(timestampMs: number, id: string): string {
  return Buffer.from(`${timestampMs}:${id}`).toString('base64url');
}

export function decodeCursor(cursor: string): { timestampMs: number; id: string } {
  const raw = Buffer.from(cursor, 'base64url').toString('utf8');
  const sep = raw.indexOf(':');
  const timestampMs = Number(raw.slice(0, sep));
  const id = raw.slice(sep + 1);
  if (sep === -1 || !Number.isFinite(timestampMs) || !id) throw new Error('invalid cursor');
  return { timestampMs, id };
}

export async function searchMessages(chatId: string, body: SearchBody) {
  const t0 = Date.now();
  const f = body.filters ?? {};
  const cur = body.cursor ? decodeCursor(body.cursor) : null;
  const q = body.query?.trim() || null;

  // Keyset cursor only supports the newest/oldest orderings; relevance and
  // most_reactions return the top page without a cursor.
  const useCursor = Boolean(cur && (body.sort === 'newest' || body.sort === 'oldest'));
  const oldest = body.sort === 'oldest';

  const rows = await sql`
    SELECT m.id, m.sender, m.timestamp, m.timestamp_ms, m.content, m.media_type,
      (SELECT count(*)::int FROM reactions WHERE message_id = m.id) AS reaction_count,
      CASE WHEN ${q}::text IS NOT NULL
        THEN ts_rank(m.search_vector, websearch_to_tsquery('english', ${q}))
        ELSE 0 END::float AS rank
    FROM messages m
    WHERE m.chat_id = ${chatId}
      AND m.message_type = ${f.message_type ?? 'message'}
      AND (${q}::text IS NULL OR m.search_vector @@ websearch_to_tsquery('english', ${q}))
      AND (${f.sender ?? null}::text IS NULL OR m.sender = ${f.sender ?? null})
      AND (${f.media_type ?? null}::text IS NULL OR m.media_type = ${f.media_type ?? null})
      AND (${f.has_media ?? null}::boolean IS NULL OR (m.media_type IS NOT NULL) = ${f.has_media ?? null})
      AND (${f.date_from ?? null}::date IS NULL OR m.timestamp >= ${f.date_from ?? null}::date)
      AND (${f.date_to ?? null}::date IS NULL OR m.timestamp < (${f.date_to ?? null}::date + 1))
      AND (${f.min_reactions ?? 0} = 0 OR (SELECT count(*) FROM reactions WHERE message_id = m.id) >= ${f.min_reactions ?? 0})
      AND (${!useCursor} OR
           (${oldest} = TRUE  AND (m.timestamp_ms, m.id) > (${cur?.timestampMs ?? 0}, ${cur?.id ?? ''})) OR
           (${oldest} = FALSE AND (m.timestamp_ms, m.id) < (${cur?.timestampMs ?? 0}, ${cur?.id ?? ''})))
    ORDER BY
      CASE WHEN ${body.sort} = 'relevance' THEN ts_rank(m.search_vector, websearch_to_tsquery('english', coalesce(${q}, ''))) END DESC NULLS LAST,
      CASE WHEN ${body.sort} = 'most_reactions' THEN (SELECT count(*) FROM reactions WHERE message_id = m.id) END DESC NULLS LAST,
      CASE WHEN ${body.sort} = 'oldest' THEN m.timestamp_ms END ASC,
      CASE WHEN ${body.sort} <> 'oldest' THEN m.timestamp_ms END DESC,
      m.id
    LIMIT ${body.limit + 1}`;

  const page = rows.slice(0, body.limit);
  const hasMore = rows.length > body.limit;
  const last = page[page.length - 1];
  const nextCursor = hasMore && last && (body.sort === 'newest' || body.sort === 'oldest')
    ? encodeCursor(Number(last.timestamp_ms), last.id as string)
    : null;

  // total intentionally ignores min_reactions — an exact reactions-filtered
  // count over 680k reactions is the timeout the old count_messages RPC hit.
  const totalRows = await sql`
    SELECT count(*)::int AS total FROM messages m
    WHERE m.chat_id = ${chatId}
      AND m.message_type = ${f.message_type ?? 'message'}
      AND (${q}::text IS NULL OR m.search_vector @@ websearch_to_tsquery('english', ${q}))
      AND (${f.sender ?? null}::text IS NULL OR m.sender = ${f.sender ?? null})
      AND (${f.media_type ?? null}::text IS NULL OR m.media_type = ${f.media_type ?? null})
      AND (${f.has_media ?? null}::boolean IS NULL OR (m.media_type IS NOT NULL) = ${f.has_media ?? null})
      AND (${f.date_from ?? null}::date IS NULL OR m.timestamp >= ${f.date_from ?? null}::date)
      AND (${f.date_to ?? null}::date IS NULL OR m.timestamp < (${f.date_to ?? null}::date + 1))`;
  const total = (totalRows[0]?.total as number) ?? 0;

  const results: SearchResult[] = page.map(r => ({
    id: r.id as string,
    sender: r.sender as string,
    sent_at: (r.timestamp as Date).toISOString(),
    content: r.content as string,
    media_type: r.media_type as string | null,
    reaction_count: r.reaction_count as number,
    rank: r.rank as number,
  }));

  return { results, total, took_ms: Date.now() - t0, next_cursor: nextCursor };
}
