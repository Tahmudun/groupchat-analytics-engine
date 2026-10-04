import { env } from '@/lib/env';
import { fail } from './respond';
import type { NextResponse } from 'next/server';

/** v1 auth: static bearer token. Returns an error response, or null if authorized. */
export function requireToken(req: Request): NextResponse | null {
  if (!env.ENGINE_API_TOKEN) return fail(503, 'auth_unconfigured', 'ENGINE_API_TOKEN is not set');
  const header = req.headers.get('authorization') ?? '';
  if (header !== `Bearer ${env.ENGINE_API_TOKEN}`) return fail(401, 'unauthorized', 'missing or invalid bearer token');
  return null;
}
