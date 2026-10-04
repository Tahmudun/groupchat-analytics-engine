import { fail, ok } from '@/lib/api/respond';
import { getProfilePick } from '@/lib/flix/data';

export const dynamic = 'force-dynamic';

/** The one selected viewer's resolved tile. Cookie-gated like every /api/flix
 * route; returning only one profile keeps inline image payloads bounded. */
export async function GET(_req: Request, { params }: { params: Promise<{ username: string }> }) {
  const { username } = await params;
  const profile = await getProfilePick(decodeURIComponent(username));
  return profile ? ok(profile) : fail(404, 'not_found', 'profile not found');
}
