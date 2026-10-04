import { fail } from '@/lib/api/respond';
import { getObject } from '@/lib/flix/storage';

export const runtime = 'nodejs';

/** Streams a private-bucket media object. Middleware already required a valid
 *  site session to reach here, so this serves it through the gated app. */
export async function GET(_req: Request, ctx: { params: Promise<{ path: string[] }> }) {
  const { path } = await ctx.params;
  const objectPath = path.map(decodeURIComponent).join('/');
  let obj;
  try {
    obj = await getObject(objectPath);
  } catch (err) {
    return fail(500, 'storage_error', err instanceof Error ? err.message : 'read failed');
  }
  if (!obj) return fail(404, 'not_found', 'no such media');
  return new Response(obj.body, {
    headers: { 'content-type': obj.contentType, 'cache-control': 'private, max-age=3600' },
  });
}
