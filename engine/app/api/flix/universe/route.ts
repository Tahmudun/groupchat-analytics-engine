import { ok, fail } from '@/lib/api/respond';
import { getUniverseGraph } from '@/lib/universe/data';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    return ok(await getUniverseGraph());
  } catch (error) {
    console.error('universe graph failed', error);
    return fail(503, 'universe_unavailable', 'The universe could not be loaded.');
  }
}

