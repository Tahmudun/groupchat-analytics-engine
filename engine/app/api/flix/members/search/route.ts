import { z } from 'zod';
import { ok, fail } from '@/lib/api/respond';
import { searchMembers } from '@/lib/flix/data';

const QuerySchema = z.string().trim().min(1).max(80);

/** Netflix-style member search: ?q= matches username/display name/aliases,
 *  returns ≤24 show cards. Cookie-gated by middleware like all /api/flix. */
export async function GET(req: Request) {
  const parsed = QuerySchema.safeParse(new URL(req.url).searchParams.get('q') ?? '');
  if (!parsed.success) return fail(400, 'invalid_query', 'q must be 1–80 characters');
  return ok(await searchMembers(parsed.data));
}
