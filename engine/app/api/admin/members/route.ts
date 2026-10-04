import { requireAdmin } from '@/lib/admin/guard';
import { ok, fail } from '@/lib/api/respond';
import { sql } from '@/lib/db/client';

export async function GET(req: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const url = new URL(req.url);
  const chat = url.searchParams.get('chat');
  if (!chat) return fail(400, 'bad_request', 'chat query param required');
  const includeInactive = url.searchParams.get('include_inactive') === 'true';

  const [exists] = await sql`SELECT id FROM chats WHERE id = ${chat}`;
  if (!exists) return fail(404, 'chat_not_found', `no chat '${chat}'`);

  const members = await sql`
    SELECT m.username, m.alias AS display_name, m.status,
      COALESCE(w.messages_all_time, 0)::int AS message_count,
      (SELECT count(*)::int FROM message_mentions mm
        WHERE mm.chat_id = ${chat} AND mm.member_username = m.username) AS mention_count,
      coalesce(a.aliases, '[]'::json) AS aliases
    FROM members m
    LEFT JOIN weekly_stats_v2 w
      ON w.chat_id = m.chat_id AND w.member_username = m.username
    LEFT JOIN LATERAL (
      SELECT json_agg(json_build_object('alias', alias, 'type', alias_type) ORDER BY alias) AS aliases
      FROM member_aliases WHERE chat_id = ${chat} AND member_username = m.username
    ) a ON TRUE
    WHERE m.chat_id = ${chat} AND (${includeInactive} OR m.status <> 'removed')
    ORDER BY message_count DESC`;
  return ok(members, { count: members.length, include_inactive: includeInactive });
}
