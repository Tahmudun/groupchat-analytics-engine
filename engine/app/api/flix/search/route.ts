import { z } from 'zod';
import { ok, fail } from '@/lib/api/respond';
import { sql } from '@/lib/db/client';
import { SearchBodySchema, searchMessages } from '@/lib/search/query';
import { FLIX_CHAT } from '@/lib/flix/config';

const BodySchema = SearchBodySchema.extend({ chat: z.string().default(FLIX_CHAT) });

export async function POST(req: Request) {
  const parsed = BodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return fail(400, 'invalid_body', parsed.error.issues.map(i => i.message).join('; '));
  const { chat, ...body } = parsed.data;

  const [exists] = await sql`SELECT id FROM chats WHERE id = ${chat}`;
  if (!exists) return fail(404, 'chat_not_found', `no chat '${chat}'`);

  const main = await searchMessages(chat, body);

  // "Top 10" = the same query re-ranked by reactions. Only meaningful when the
  // user has actually searched/filtered (otherwise it's just the noisiest posts).
  const hasCriteria = Boolean(body.query?.trim() || (body.filters && Object.keys(body.filters).length));
  let top: typeof main.results = [];
  if (hasCriteria && !body.cursor) {
    const t = await searchMessages(chat, { ...body, sort: 'most_reactions', limit: 10, cursor: null });
    top = t.results;
  }

  return ok(main.results, { total: main.total, took_ms: main.took_ms, next_cursor: main.next_cursor, top });
}
