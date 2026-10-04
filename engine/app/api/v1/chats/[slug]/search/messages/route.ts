import { requireToken } from '@/lib/api/auth';
import { ok, fail } from '@/lib/api/respond';
import { SearchBodySchema, searchMessages } from '@/lib/search/query';
import { sql } from '@/lib/db/client';

export async function POST(req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const denied = requireToken(req);
  if (denied) return denied;
  const { slug } = await ctx.params;

  const [chat] = await sql`SELECT id FROM chats WHERE id = ${slug}`;
  if (!chat) return fail(404, 'chat_not_found', `no chat '${slug}'`);

  let body;
  try {
    body = SearchBodySchema.parse(await req.json().catch(() => ({})));
  } catch (err) {
    return fail(400, 'invalid_body', err instanceof Error ? err.message : 'bad request');
  }

  const { results, total, took_ms, next_cursor } = await searchMessages(slug, body);
  return ok(results, { total, took_ms, next_cursor, query_expansion: null });
}
