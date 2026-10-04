import { requireToken } from '@/lib/api/auth';
import { ok } from '@/lib/api/respond';
import { sql } from '@/lib/db/client';

export async function GET(req: Request) {
  const denied = requireToken(req);
  if (denied) return denied;
  const chats = await sql`
    SELECT id, name, platform, is_synthetic, is_public, created_at FROM chats ORDER BY created_at`;
  return ok(chats, { count: chats.length });
}
