import { ok, fail } from '@/lib/api/respond';
import { sql } from '@/lib/db/client';
import { FLIX_CHAT } from '@/lib/flix/config';

const WINDOW_HOURS = 6;
const SIDE_CAP = 300;

/** ±6h of messages around a target message — the "moment player" reel.
 *
 *  Fetched as two bounded halves anchored on the center message, NOT one
 *  ascending scan of the window: on a busy day the 6h before the center can
 *  alone exceed any flat LIMIT, which used to truncate the reel before the
 *  center was ever reached (the "Play the scene never shows the message"
 *  bug). Each half is capped at SIDE_CAP, so the center is always present
 *  with up to 300 messages of context either side. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const id = url.searchParams.get('id');
  const chat = url.searchParams.get('chat') ?? FLIX_CHAT;
  if (!id) return fail(400, 'bad_request', 'id required');

  const [center] = await sql`
    SELECT id, sender, timestamp, timestamp_ms, content, media_type
    FROM messages WHERE id = ${id} AND chat_id = ${chat}`;
  if (!center) return fail(404, 'not_found', 'no such message');

  const centerTs = center.timestamp as Date;
  const from = new Date(centerTs.getTime() - WINDOW_HOURS * 3600_000);
  const to = new Date(centerTs.getTime() + WINDOW_HOURS * 3600_000);

  // (timestamp, id) is the reel's total order; the center row itself lands in
  // the "before" half via the <= on its own id.
  const beforeRows = await sql`
    SELECT m.id, m.sender, m.timestamp, m.content, m.media_type,
           COALESCE(c.rxn_count, 0)::int AS reaction_count
    FROM messages m
    LEFT JOIN message_reaction_counts c ON c.message_id = m.id
    WHERE m.chat_id = ${chat} AND m.message_type = 'message'
      AND m.timestamp >= ${from}
      AND (m.timestamp < ${centerTs} OR (m.timestamp = ${centerTs} AND m.id <= ${id}))
    ORDER BY m.timestamp DESC, m.id DESC
    LIMIT ${SIDE_CAP}`;

  const afterRows = await sql`
    SELECT m.id, m.sender, m.timestamp, m.content, m.media_type,
           COALESCE(c.rxn_count, 0)::int AS reaction_count
    FROM messages m
    LEFT JOIN message_reaction_counts c ON c.message_id = m.id
    WHERE m.chat_id = ${chat} AND m.message_type = 'message'
      AND m.timestamp <= ${to}
      AND (m.timestamp > ${centerTs} OR (m.timestamp = ${centerTs} AND m.id > ${id}))
    ORDER BY m.timestamp ASC, m.id ASC
    LIMIT ${SIDE_CAP}`;

  const rows = [...beforeRows.reverse(), ...afterRows];

  const messages = rows.map(r => ({
    id: r.id as string,
    sender: r.sender as string,
    sentAt: (r.timestamp as Date).toISOString(),
    content: r.content as string,
    mediaType: (r.media_type as string | null) ?? null,
    reactionCount: r.reaction_count as number,
  }));

  return ok({
    center: {
      id: center.id as string,
      sender: center.sender as string,
      sentAt: centerTs.toISOString(),
      content: center.content as string,
      mediaType: (center.media_type as string | null) ?? null,
    },
    messages,
  });
}
