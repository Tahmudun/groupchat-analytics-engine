import { z } from 'zod';
import { requireAdmin } from '@/lib/admin/guard';
import { aliasWarning } from '@/lib/admin/aliases';
import { ok, fail } from '@/lib/api/respond';
import { sql } from '@/lib/db/client';
import { loadChatConfig } from '@/lib/config/load';

const AddSchema = z.object({
  chat: z.string().min(1),
  member: z.string().min(1),
  alias: z.string().trim().min(1),
  type: z.enum(['nickname', 'handle', 'real_name', 'roast']).default('nickname'),
});

const DeleteSchema = AddSchema.omit({ type: true });

export async function POST(req: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const parsed = AddSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail(400, 'bad_request', parsed.error.issues.map(i => i.message).join('; '));
  const { chat, member, alias, type } = parsed.data;

  const [exists] = await sql`SELECT username FROM members WHERE chat_id = ${chat} AND username = ${member}`;
  if (!exists) return fail(404, 'member_not_found', `no member '${member}' in '${chat}'`);

  const warning = aliasWarning(alias, await loadChatConfig(chat));
  const rows = await sql`
    INSERT INTO member_aliases (chat_id, member_username, alias, alias_type)
    VALUES (${chat}, ${member}, ${alias.trim().toLowerCase()}, ${type})
    ON CONFLICT (chat_id, member_username, alias) DO NOTHING
    RETURNING alias`;
  return ok({ inserted: rows.length > 0, warning });
}

export async function DELETE(req: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const parsed = DeleteSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail(400, 'bad_request', parsed.error.issues.map(i => i.message).join('; '));
  const { chat, member, alias } = parsed.data;
  const rows = await sql`
    DELETE FROM member_aliases
    WHERE chat_id = ${chat} AND member_username = ${member} AND alias = ${alias.trim().toLowerCase()}
    RETURNING alias`;
  return ok({ deleted: rows.length > 0 });
}
