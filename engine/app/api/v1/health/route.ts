import { NextResponse } from 'next/server';
import { sql } from '@/lib/db/client';

// Never cached: the whole point is to observe the live process.
export const dynamic = 'force-dynamic';

export async function GET() {
  const started = Date.now();
  try {
    await sql`SELECT 1 AS one`;
    return NextResponse.json({
      data: { ok: true, db: 'up', latencyMs: Date.now() - started },
      meta: { ts: new Date().toISOString() },
    });
  } catch {
    // Body deliberately carries no error detail — this endpoint is public.
    return NextResponse.json(
      { data: { ok: false, db: 'down' }, meta: { ts: new Date().toISOString() } },
      { status: 503 },
    );
  }
}
