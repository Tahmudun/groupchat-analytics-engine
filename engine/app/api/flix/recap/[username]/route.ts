import { ok, fail } from '@/lib/api/respond';
import { sql } from '@/lib/db/client';
import { STATS_VERSION, superlativeUsernames, type RecapStats } from '@/lib/recap/types';
import { FLIX_CHAT } from '@/lib/flix/config';

export const dynamic = 'force-dynamic';

/** One member's precomputed Recap blob. Cookie-gated by middleware (NOT in
 *  isPublic). 404 = compute never ran, member excluded, or stale version —
 *  the member page hides the button on 404. Also returns `names`: display
 *  name for every member username named in a superlative field, so the UI
 *  never has to show a raw username. */
export async function GET(_req: Request, { params }: { params: Promise<{ username: string }> }) {
  const { username } = await params;
  const [row] = await sql`
    SELECT stats, computed_at FROM member_recap
    WHERE chat_id = ${FLIX_CHAT} AND member_username = ${decodeURIComponent(username)}
      AND stats_version = ${STATS_VERSION}`;
  if (!row) return fail(404, 'not_found', 'no recap for this member');
  const stats = row.stats as RecapStats;
  const usernames = superlativeUsernames(stats);
  const names: Record<string, string> = {};
  if (usernames.length > 0) {
    for (const r of await sql`
      SELECT username, COALESCE(alias, username) AS display_name
      FROM members WHERE username = ANY(${usernames})`) {
      names[r.username as string] = r.display_name as string;
    }
  }
  return ok({ stats, computedAt: row.computed_at, names });
}
