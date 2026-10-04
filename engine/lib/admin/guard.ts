import { cookies } from 'next/headers';
import { env } from '@/lib/env';
import { fail } from '@/lib/api/respond';
import { verifyToken, COOKIE_NAMES } from '@/lib/auth/session';
import { DEMO_MODE } from '@/lib/demo';
import type { NextResponse } from 'next/server';

/**
 * Admin API guard. Two ways in:
 *  - a valid signed admin cookie (the deployed FLIX gate), when
 *    ADMIN_PASSWORD_HASH + SESSION_SECRET are configured; or
 *  - the local-only ADMIN_ENABLED=true escape hatch during development.
 * Otherwise the route is invisible (404), same as before.
 */
export async function requireAdmin(): Promise<NextResponse | null> {
  // the public demo has no admin surface at all (middleware 404s it first)
  if (DEMO_MODE) return fail(404, 'not_found', 'not found');
  const gateConfigured = Boolean(env.SESSION_SECRET && env.ADMIN_PASSWORD_HASH);
  if (gateConfigured) {
    const token = (await cookies()).get(COOKIE_NAMES.admin)?.value;
    if (await verifyToken(token, 'admin', env.SESSION_SECRET!)) return null;
    return fail(404, 'not_found', 'not found');
  }
  if (env.ADMIN_ENABLED === 'true' && process.env.NODE_ENV !== 'production') return null;
  return fail(404, 'not_found', 'not found');
}
