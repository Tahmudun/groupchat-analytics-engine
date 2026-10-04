import { requireToken } from '@/lib/api/auth';
import { ok, fail } from '@/lib/api/respond';
import { sql } from '@/lib/db/client';

export async function GET(req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const denied = requireToken(req);
  if (denied) return denied;
  const { slug } = await ctx.params;
  const [chat] = await sql`SELECT id FROM chats WHERE id = ${slug}`;
  if (!chat) return fail(404, 'chat_not_found', `no chat '${slug}'`);

  const scores = await sql`
    SELECT DISTINCT ON (member_username)
      member_username, date, score,
      activity_component, sentiment_component, reaction_component,
      engagement_component, longevity_component, scoring_version
    FROM member_scores WHERE chat_id = ${slug}
    ORDER BY member_username, date DESC`;
  return ok(scores, { count: scores.length });
}
