import { z } from 'zod';
import { requireAdmin } from '@/lib/admin/guard';
import { ok, fail } from '@/lib/api/respond';
import { sql } from '@/lib/db/client';
import { FLIX_CHAT } from '@/lib/flix/config';
import { validateImageRef } from '@/lib/flix/storage';
import { moveId } from '@/lib/admin/reorder';

/** Full custom-category tree for the editor (all categories, enabled or not). */
export async function GET(req: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const chat = new URL(req.url).searchParams.get('chat') ?? FLIX_CHAT;

  const cats = await sql`
    SELECT id, title, position, enabled FROM custom_categories
    WHERE chat_id = ${chat} ORDER BY position, id`;
  const entries = await sql`
    SELECT e.id, e.category_id, e.title, e.subtitle, e.poster_url, e.poster_preset, e.member_username, e.position
    FROM custom_category_entries e
    JOIN custom_categories c ON c.id = e.category_id
    WHERE c.chat_id = ${chat} ORDER BY e.position, e.id`;
  const byCat = new Map<string, unknown[]>();
  for (const e of entries) {
    const k = String(e.category_id);
    if (!byCat.has(k)) byCat.set(k, []);
    byCat.get(k)!.push(e);
  }
  return ok(cats.map(c => ({ ...c, entries: byCat.get(String(c.id)) ?? [] })));
}

const PostSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('category'), chat: z.string().default(FLIX_CHAT), title: z.string().min(1).max(80) }),
  z.object({
    type: z.literal('entry'),
    category_id: z.coerce.number().int(),
    title: z.string().min(1).max(120),
    subtitle: z.string().max(160).nullable().optional(),
    poster_url: z.string().nullable().optional(),
    poster_preset: z.string().nullable().optional(),
    member_username: z.string().nullable().optional(),
  }),
]);

export async function POST(req: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const parsed = PostSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail(400, 'bad_request', parsed.error.issues.map(i => i.message).join('; '));
  const body = parsed.data;

  if (body.type === 'category') {
    const [row] = await sql`
      INSERT INTO custom_categories (chat_id, title, position)
      VALUES (${body.chat}, ${body.title},
              (SELECT COALESCE(max(position), 0) + 1 FROM custom_categories WHERE chat_id = ${body.chat}))
      RETURNING id`;
    return ok({ id: row!.id });
  }
  const posterReason = validateImageRef(body.poster_url, 'poster');
  if (posterReason) return fail(400, 'bad_image', posterReason);
  if (body.member_username) {
    const [member] = await sql`SELECT username FROM members WHERE username = ${body.member_username} LIMIT 1`;
    if (!member) return fail(400, 'unknown_member', `no member '${body.member_username}'`);
    const [dup] = await sql`
      SELECT id FROM custom_category_entries
      WHERE category_id = ${body.category_id} AND member_username = ${body.member_username}`;
    if (dup) return fail(409, 'duplicate_member', 'that member is already in this row');
  }
  const [row] = await sql`
    INSERT INTO custom_category_entries (category_id, title, subtitle, poster_url, poster_preset, member_username, position)
    VALUES (${body.category_id}, ${body.title}, ${body.subtitle ?? null}, ${body.poster_url ?? null},
            ${body.poster_preset ?? null}, ${body.member_username ?? null},
            (SELECT COALESCE(max(position), 0) + 1 FROM custom_category_entries WHERE category_id = ${body.category_id}))
    RETURNING id`;
  return ok({ id: row!.id });
}

const PutSchema = z.object({
  type: z.enum(['category', 'entry']),
  id: z.coerce.number().int(),
  title: z.string().min(1).max(120).optional(),
  enabled: z.boolean().optional(),
  subtitle: z.string().max(160).nullable().optional(),
  member_username: z.string().nullable().optional(),
  move: z.enum(['up', 'down']).optional(),
});

export async function PUT(req: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const parsed = PutSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail(400, 'bad_request', parsed.error.issues.map(i => i.message).join('; '));
  const b = parsed.data;

  if (b.move) {
    const table = b.type === 'category' ? 'category' : 'entry';
    const rows = b.type === 'category'
      ? await sql`
          SELECT id FROM custom_categories
          WHERE chat_id = (SELECT chat_id FROM custom_categories WHERE id = ${b.id})
          ORDER BY position, id`
      : await sql`
          SELECT id FROM custom_category_entries
          WHERE category_id = (SELECT category_id FROM custom_category_entries WHERE id = ${b.id})
          ORDER BY position, id`;
    if (rows.length === 0) return fail(404, 'not_found', `no such ${table}`);
    const order = moveId(rows.map(r => Number(r.id)), b.id, b.move);
    if (order) {
      await sql.begin(async tx => {
        for (let i = 0; i < order.length; i++) {
          if (b.type === 'category') await tx`UPDATE custom_categories SET position = ${i + 1} WHERE id = ${order[i]!}`;
          else await tx`UPDATE custom_category_entries SET position = ${i + 1} WHERE id = ${order[i]!}`;
        }
      });
    }
    return ok({ moved: b.id });
  }

  if (b.type === 'category') {
    await sql`UPDATE custom_categories SET
      title = COALESCE(${b.title ?? null}, title),
      enabled = COALESCE(${b.enabled ?? null}, enabled)
      WHERE id = ${b.id}`;
  } else {
    await sql`UPDATE custom_category_entries SET
      title = COALESCE(${b.title ?? null}, title),
      subtitle = ${b.subtitle ?? null},
      member_username = ${b.member_username ?? null}
      WHERE id = ${b.id}`;
  }
  return ok({ updated: b.id });
}

const DeleteSchema = z.object({ type: z.enum(['category', 'entry']), id: z.coerce.number().int() });

export async function DELETE(req: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const parsed = DeleteSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail(400, 'bad_request', parsed.error.issues.map(i => i.message).join('; '));
  const { type, id } = parsed.data;
  if (type === 'category') await sql`DELETE FROM custom_categories WHERE id = ${id}`;
  else await sql`DELETE FROM custom_category_entries WHERE id = ${id}`;
  return ok({ deleted: id });
}
