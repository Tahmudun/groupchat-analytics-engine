import postgres from 'postgres';
import { env } from '@/lib/env';

/**
 * Pool sizing and prepared-statement policy, by host shape.
 *
 * Self-hosted (the default since 2026-08): direct connections to a Postgres
 * we own, so a real pool and prepared statements. The old caps existed
 * because Supabase's SESSION pooler has 15 client slots total, and both
 * failure modes that burned us were slot exhaustion:
 *   - frozen Vercel lambdas holding idle slots -> site-wide 500s (session 15)
 *   - local pipelines opening a wide pool into the same 15 slots
 * Neither condition exists on a dedicated box.
 *
 * The cap is therefore keyed on whether the URL points at Supabase, NOT on
 * "is this Vercel". Keying it on VERCEL would give a local pipeline run
 * against Supabase a pool of 10 into those 15 shared slots -- the exact
 * mechanism of the session-15 outage -- and would do so silently, with no
 * .env change to notice. Both branches stay live because until the Task 13
 * cutover, Supabase is still the production database and the documented
 * rollback path.
 */
export function resolvePoolConfig(
  url: string,
  processEnv: NodeJS.ProcessEnv,
): { max: number; prepare: boolean } {
  // Transaction-mode poolers multiplex connections and cannot keep prepared
  // statements across checkouts. Supabase's Supavisor is detected by port;
  // Neon's pooled endpoint (PgBouncer in transaction mode -- the public demo's
  // Vercel URL) by the "-pooler." in its host.
  const isTransactionPooler = /:6543(\/|$)/.test(url) || /@[^/@]*-pooler\./.test(url);
  // db.<ref>.supabase.co (direct) and <region>.pooler.supabase.com (Supavisor).
  const isSupabase = /@[^/@]*\bsupabase\.(co|com)\b/.test(url);

  const override = Number(processEnv.DB_POOL_MAX);
  const max = Number.isInteger(override) && override > 0
    ? override
    : isSupabase
      ? (processEnv.VERCEL ? 2 : 4) // 15 shared slots; leave room for everyone else
      : 10;

  return { max, prepare: !isTransactionPooler };
}

const { max, prepare } = resolvePoolConfig(env.DATABASE_URL, process.env);

export const sql = postgres(env.DATABASE_URL, {
  max,
  prepare,
  idle_timeout: 20,
  connect_timeout: 30,
  keep_alive: 30,
  onnotice: () => {}, // IF NOT EXISTS notices are expected noise
});
