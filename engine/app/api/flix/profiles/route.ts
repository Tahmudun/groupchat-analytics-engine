import { ok } from '@/lib/api/respond';
import { getProfilePickList } from '@/lib/flix/data';

export const dynamic = 'force-dynamic';

/** The "Who's watching?" grid: top 8 most active this week + their tile art.
 *  Cookie-gated by middleware when auth is on (NOT in isPublic) — the login
 *  form only fetches it AFTER the site password succeeds, so member names and
 *  photos never ship in the pre-auth login HTML. */
export async function GET() {
  return ok(await getProfilePickList());
}
