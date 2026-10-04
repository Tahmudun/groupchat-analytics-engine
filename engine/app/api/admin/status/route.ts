import { requireAdmin } from '@/lib/admin/guard';
import { currentJob } from '@/lib/admin/jobs';
import { ok, fail } from '@/lib/api/respond';
import { sql } from '@/lib/db/client';
import { SCORING_VERSION } from '@/lib/scoring/formula';

export async function GET(req: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const chat = new URL(req.url).searchParams.get('chat');
  if (!chat) return fail(400, 'bad_request', 'chat query param required');

  const chats = await sql`SELECT id FROM chats ORDER BY id`;
  // Ingest keeps weekly_stats current. Never COUNT the million-row messages
  // table from this endpoint: active admin jobs poll status every 1-5 seconds,
  // and the old aggregate was the database's largest cumulative disk reader.
  const [msgs] = await sql`
    SELECT COALESCE(sum(messages_all_time), 0)::int AS total,
           max(last_active_at) AS newest
    FROM weekly_stats WHERE chat_id = ${chat}`;
  const [members] = await sql`
    SELECT count(*)::int AS total FROM members WHERE chat_id = ${chat} AND status <> 'removed'`;
  const [aliases] = await sql`
    SELECT count(*)::int AS total FROM member_aliases WHERE chat_id = ${chat}`;
  const [mentions] = await sql`
    SELECT count(*)::int AS total, count(DISTINCT message_id)::int AS msgs
    FROM message_mentions WHERE chat_id = ${chat}`;
  const [sentiments] = await sql`
    SELECT count(*)::int AS total, max(computed_at) AS last
    FROM mention_sentiments WHERE chat_id = ${chat}`;
  const sentimentVersions = await sql`
    SELECT model_version, count(*)::int AS n FROM mention_sentiments
    WHERE chat_id = ${chat} GROUP BY model_version ORDER BY n DESC`;
  const [scores] = await sql`
    SELECT count(*)::int AS total, max(date) AS last_day, max(computed_at) AS last
    FROM member_scores WHERE chat_id = ${chat} AND scoring_version = ${SCORING_VERSION}`;

  return ok({
    chats,
    coverage: {
      messages: msgs!.total,
      newestMessage: msgs!.newest,
      activeMembers: members!.total,
      aliasCount: aliases!.total,
      mentions: mentions!.total,
      mentionMessages: mentions!.msgs,
      sentiments: sentiments!.total,
      sentimentsLast: sentiments!.last,
      sentimentVersions,
      scoreRows: scores!.total,
      lastScoreDay: scores!.last_day,
      scoresLast: scores!.last,
    },
    job: currentJob(),
  });
}
