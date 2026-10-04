import { NextResponse } from 'next/server';

export function ok(data: unknown, meta: Record<string, unknown> = {}): NextResponse {
  return NextResponse.json({ data, meta });
}

export function fail(status: number, code: string, message: string): NextResponse {
  return NextResponse.json({ error: { code, message } }, { status });
}
