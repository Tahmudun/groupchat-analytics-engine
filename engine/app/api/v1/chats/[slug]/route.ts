import { requireToken } from '@/lib/api/auth';
import { ok, fail } from '@/lib/api/respond';
import { sql } from '@/lib/db/client';

export async function GET(req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const denied = requireToken(req);
  if (denied) return denied;
  const { slug } = await ctx.params;
  const [chat] = await sql`
    SELECT c.id, c.name, c.platform, c.is_synthetic, c.is_public, c.created_at,
      (SELECT count(*)::int FROM messages WHERE chat_id = c.id AND message_type = 'message') AS message_count,
      (SELECT count(*)::int FROM members WHERE chat_id = c.id AND status <> 'removed') AS member_count,
      (SELECT min(timestamp) FROM messages WHERE chat_id = c.id) AS first_message_at,
      (SELECT max(timestamp) FROM messages WHERE chat_id = c.id) AS last_message_at
    FROM chats c WHERE c.id = ${slug}`;
  if (!chat) return fail(404, 'chat_not_found', `no chat '${slug}'`);
  return ok(chat);
}
