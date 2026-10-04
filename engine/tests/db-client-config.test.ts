import { describe, it, expect } from 'vitest';
import { resolvePoolConfig } from '@/lib/db/client';

const SELF_HOSTED = 'postgres://u:p@postgres:5432/gcw_real';
const SUPABASE_SESSION = 'postgres://u:p@aws-0-us-east-1.pooler.supabase.com:5432/postgres';
const SUPABASE_TXN = 'postgres://u:p@aws-0-us-east-1.pooler.supabase.com:6543/postgres';
const SUPABASE_DIRECT = 'postgres://u:p@db.abcdefgh.supabase.co:5432/postgres';
const NEON_POOLED = 'postgresql://u:p@ep-quiet-sky-a1b2c3d4-pooler.us-east-1.aws.neon.tech/neondb?sslmode=require';
const NEON_DIRECT = 'postgresql://u:p@ep-quiet-sky-a1b2c3d4.us-east-1.aws.neon.tech/neondb?sslmode=require';

describe('resolvePoolConfig', () => {
  it('uses a real pool and prepared statements on a dedicated host', () => {
    expect(resolvePoolConfig(SELF_HOSTED, {} as NodeJS.ProcessEnv)).toEqual({ max: 10, prepare: true });
  });

  it('honours an explicit DB_POOL_MAX override', () => {
    const cfg = resolvePoolConfig(SELF_HOSTED, { DB_POOL_MAX: '4' } as unknown as NodeJS.ProcessEnv);
    expect(cfg.max).toBe(4);
  });

  it('still disables prepared statements against a transaction pooler', () => {
    expect(resolvePoolConfig(SUPABASE_TXN, {} as NodeJS.ProcessEnv).prepare).toBe(false);
  });

  it('keeps the tiny pool on serverless', () => {
    const cfg = resolvePoolConfig(SUPABASE_TXN, { VERCEL: '1' } as unknown as NodeJS.ProcessEnv);
    expect(cfg.max).toBe(2);
  });

  it('ignores a non-numeric DB_POOL_MAX rather than producing NaN', () => {
    const cfg = resolvePoolConfig(SELF_HOSTED, { DB_POOL_MAX: 'lots' } as unknown as NodeJS.ProcessEnv);
    expect(cfg.max).toBe(10);
  });

  // Regression: a local pipeline (no VERCEL) against Supabase's session pooler
  // must NOT open 10 of its 15 shared client slots -- that is the session-15
  // site-wide-500s mechanism. The cap keys on the host, not on "is this Vercel".
  it('caps the pool against the Supabase session pooler even off Vercel', () => {
    expect(resolvePoolConfig(SUPABASE_SESSION, {} as NodeJS.ProcessEnv).max).toBe(4);
  });

  it('caps the pool against a direct Supabase host too', () => {
    expect(resolvePoolConfig(SUPABASE_DIRECT, {} as NodeJS.ProcessEnv).max).toBe(4);
  });

  // A self-hosted database whose password happens to contain the vendor name
  // must not be mistaken for Supabase (the host is what matters).
  it('does not treat a self-hosted host as Supabase because of userinfo', () => {
    expect(resolvePoolConfig('postgres://u:supabase.co@postgres:5432/gcw_real', {} as NodeJS.ProcessEnv).max).toBe(10);
  });

  // The public demo runs on Vercel against Neon's pooled endpoint (PgBouncer,
  // transaction mode); the CLI builds it over the direct endpoint.
  it("disables prepared statements on Neon's pooled endpoint", () => {
    expect(resolvePoolConfig(NEON_POOLED, { VERCEL: '1' } as unknown as NodeJS.ProcessEnv).prepare).toBe(false);
  });

  it("keeps prepared statements on Neon's direct endpoint", () => {
    expect(resolvePoolConfig(NEON_DIRECT, {} as NodeJS.ProcessEnv).prepare).toBe(true);
  });

  it('does not read "-pooler." in the password as a pooled host', () => {
    expect(resolvePoolConfig('postgres://u:x-pooler.y@postgres:5432/gcw_real', {} as NodeJS.ProcessEnv).prepare).toBe(true);
  });
});
