import { NextResponse } from 'next/server';
import { COOKIE_NAMES } from '@/lib/auth/session';

export const runtime = 'nodejs';

/** Clears both gates. Body {scope} optional — default clears everything. */
export async function POST(req: Request) {
  const scope = new URL(req.url).searchParams.get('scope');
  const res = NextResponse.json({ data: { ok: true } });
  const kinds: Array<'site' | 'admin'> = scope === 'site' || scope === 'admin' ? [scope] : ['site', 'admin'];
  for (const k of kinds) res.cookies.set(COOKIE_NAMES[k], '', { path: '/', maxAge: 0 });
  return res;
}
