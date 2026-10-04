import { z } from 'zod';
import { verify } from '@node-rs/argon2';
import { NextResponse } from 'next/server';
import { env } from '@/lib/env';
import { fail } from '@/lib/api/respond';
import { createToken, COOKIE_NAMES, MAX_AGE_SECONDS, type SessionKind } from '@/lib/auth/session';
import { checkLoginRate, recordFailedLogin, clearAttempts } from '@/lib/auth/rateLimit';

// argon2 is a native addon — force the node runtime, never the edge.
export const runtime = 'nodejs';

// One box, no scope from the client: the server matches the entered password
// against whichever gate it fits. Admin is tried first (it's the superset).
const BodySchema = z.object({
  password: z.string().min(1).max(200),
});

const HASH_FOR: Record<SessionKind, () => string | undefined> = {
  site: () => env.SITE_PASSWORD_HASH,
  admin: () => env.ADMIN_PASSWORD_HASH,
};

// Admin first so that, if the same password were set for both, admin wins.
const TRY_ORDER: SessionKind[] = ['admin', 'site'];

function clientIp(req: Request): string {
  const fwd = req.headers.get('x-forwarded-for');
  return (fwd?.split(',')[0] ?? req.headers.get('x-real-ip') ?? 'unknown').trim();
}

export async function POST(req: Request) {
  if (!env.SESSION_SECRET) return fail(503, 'auth_disabled', 'authentication is not configured');
  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail(400, 'bad_request', 'password required');
  const { password } = parsed.data;

  const configured = TRY_ORDER.filter(s => HASH_FOR[s]());
  if (configured.length === 0) return fail(503, 'auth_disabled', 'authentication is not configured');

  const rate = await checkLoginRate(clientIp(req));
  if (!rate.ok) {
    return NextResponse.json(
      { error: { code: 'rate_limited', message: 'Too many attempts. Try again later.' } },
      { status: 429, headers: { 'retry-after': String(rate.retryAfterSeconds) } },
    );
  }

  let matched: SessionKind | null = null;
  for (const scope of configured) {
    if (await verify(HASH_FOR[scope]()!, password).catch(() => false)) { matched = scope; break; }
  }
  if (!matched) {
    await recordFailedLogin(clientIp(req));
    return fail(401, 'invalid', 'Incorrect password.');
  }

  await clearAttempts(clientIp(req));
  const res = NextResponse.json({ data: { ok: true, scope: matched } });

  // Always grant member (site) access; the admin password additionally grants
  // the admin cookie — the middleware requires BOTH cookies for /admin.
  const grants: SessionKind[] = matched === 'admin' ? ['site', 'admin'] : ['site'];
  for (const kind of grants) {
    res.cookies.set(COOKIE_NAMES[kind], await createToken(kind, env.SESSION_SECRET), {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: MAX_AGE_SECONDS[kind],
    });
  }
  return res;
}
