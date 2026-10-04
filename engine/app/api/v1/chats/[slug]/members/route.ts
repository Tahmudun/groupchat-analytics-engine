import { requireToken } from '@/lib/api/auth';
import { ok, fail } from '@/lib/api/respond';
import { sql } from '@/lib/db/client';

export async function GET(req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const denied = requireToken(req);
  if (denied) return denied;
  const { slug } = await ctx.params;
  const url = new URL(req.url);
  const includeInactive = url.searchParams.get('include_inactive') === 'true';

  const [chat] = await sql`SELECT id FROM chats WHERE id = ${slug}`;
  if (!chat) return fail(404, 'chat_not_found', `no chat '${slug}'`);

  const members = await sql`
    SELECT m.username, m.alias, m.bio_name, m.status,
      (SELECT count(*)::int FROM messages msg WHERE msg.sender = m.username AND msg.chat_id = ${slug} AND msg.message_type = 'message') AS message_count,
      s.score AS current_score, s.date AS score_date
    FROM members m
    LEFT JOIN LATERAL (
      SELECT score, date FROM member_scores
      WHERE chat_id = ${slug} AND member_username = m.username
      ORDER BY date DESC LIMIT 1
    ) s ON TRUE
    WHERE m.chat_id = ${slug} AND (${includeInactive} OR m.status <> 'removed')
    ORDER BY message_count DESC`;
  return ok(members, { count: members.length, include_inactive: includeInactive });
}
