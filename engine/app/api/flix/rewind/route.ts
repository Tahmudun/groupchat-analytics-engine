import { ok, fail } from '@/lib/api/respond';
import { sql } from '@/lib/db/client';
import { FLIX_CHAT } from '@/lib/flix/config';

const CAP = 400;

/** Who was active around a moment: a cast row (senders by volume) + the
 *  messages in a ±`hours` window. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const chat = url.searchParams.get('chat') ?? FLIX_CHAT;
  const t = url.searchParams.get('t');
  const hours = Math.min(Math.max(Number(url.searchParams.get('hours')) || 3, 1), 24);
  if (!t) return fail(400, 'bad_request', 't (ISO timestamp) required');
  const center = new Date(t);
  if (Number.isNaN(center.getTime())) return fail(400, 'bad_request', 'invalid timestamp');

  const from = new Date(center.getTime() - hours * 3600_000);
  const to = new Date(center.getTime() + hours * 3600_000);

  const rows = await sql`
    SELECT m.id, m.sender, m.timestamp, m.content, m.media_type,
           COALESCE(c.rxn_count, 0)::int AS reaction_count
    FROM messages m
    LEFT JOIN message_reaction_counts c ON c.message_id = m.id
    WHERE m.chat_id = ${chat} AND m.message_type = 'message'
      AND m.timestamp >= ${from} AND m.timestamp <= ${to}
    ORDER BY m.timestamp, m.id
    LIMIT ${CAP}`;

  const messages = rows.map(r => ({
    id: r.id as string,
    sender: r.sender as string,
    sentAt: (r.timestamp as Date).toISOString(),
    content: r.content as string,
    mediaType: (r.media_type as string | null) ?? null,
    reactionCount: r.reaction_count as number,
  }));

  const counts = new Map<string, number>();
  for (const m of messages) counts.set(m.sender, (counts.get(m.sender) ?? 0) + 1);
  const cast = [...counts.entries()]
    .map(([sender, n]) => ({ sender, n }))
    .sort((a, b) => b.n - a.n);

  return ok({ cast, messages }, { count: messages.length, from: from.toISOString(), to: to.toISOString() });
}
