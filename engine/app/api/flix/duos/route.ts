import { ok, fail } from '@/lib/api/respond';
import { sql } from '@/lib/db/client';
import { FLIX_CHAT } from '@/lib/flix/config';

const DEFAULT_WINDOW = 60; // seconds
const LIMIT = 50;

/** When B replied to A within `window` seconds — the pairs A→B, newest first.
 *  Same adjacent-message approximation as scoring/find_interactions. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const chat = url.searchParams.get('chat') ?? FLIX_CHAT;
  const a = url.searchParams.get('a');
  const b = url.searchParams.get('b');
  const windowSec = Math.min(Math.max(Number(url.searchParams.get('window')) || DEFAULT_WINDOW, 1), 3600);
  if (!a || !b) return fail(400, 'bad_request', 'a and b required');

  // Pull A's and B's messages together, ordered; a B message "replies to" the
  // most recent A message when it lands within the window.
  const rows = await sql`
    WITH pair AS (
      SELECT id, sender, timestamp, content, media_type
      FROM messages
      WHERE chat_id = ${chat} AND message_type = 'message'
        AND sender IN (${a}, ${b})
    ),
    seq AS (
      SELECT id, sender, timestamp, content, media_type,
             lag(sender)    OVER (ORDER BY timestamp, id) AS prev_sender,
             lag(timestamp) OVER (ORDER BY timestamp, id) AS prev_ts,
             lag(id)        OVER (ORDER BY timestamp, id) AS prev_id,
             lag(content)   OVER (ORDER BY timestamp, id) AS prev_content
      FROM pair
    )
    SELECT id, sender, timestamp, content, media_type, prev_id, prev_content
    FROM seq
    WHERE sender = ${b} AND prev_sender = ${a}
      AND timestamp <= prev_ts + (${windowSec} || ' seconds')::interval
    ORDER BY timestamp DESC
    LIMIT ${LIMIT}`;

  const pairs = rows.map(r => ({
    reply: {
      id: r.id as string,
      sender: r.sender as string,
      sentAt: (r.timestamp as Date).toISOString(),
      content: r.content as string,
      mediaType: (r.media_type as string | null) ?? null,
      reactionCount: 0,
    },
    prompt: { id: r.prev_id as string, content: (r.prev_content as string | null) ?? '' },
  }));
  return ok(pairs, { count: pairs.length, window: windowSec });
}
