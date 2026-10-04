/**
 * Verifies the engine can bootstrap a database from zero.
 *
 * Creates a throwaway schema, points search_path at it, runs every migration
 * in order, asserts the full object set exists, then drops the schema. Empty
 * tables mean negligible IO, so this is safe against any reachable Postgres.
 *
 * Run: pnpm verify:bootstrap
 */
import postgres from 'postgres';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { env } from '@/lib/env';

const SCHEMA = `bootstrap_check_${Date.now()}`;
const DIR = path.join(process.cwd(), 'supabase', 'migrations');

const EXPECTED_TABLES = [
  'messages', 'reactions', 'members', 'site_stats',
  'chats', 'member_aliases', 'message_mentions', 'mention_sentiments',
  'member_scores', 'member_profiles', 'custom_categories',
  'custom_category_entries', 'login_attempts', 'member_recap',
];

const EXPECTED_MATVIEWS = [
  'sender_message_counts', 'message_reaction_counts',
  'weekly_stats', 'weekly_stats_v2', 'member_costars',
];

/**
 * A DEDICATED single connection, not the shared pool from lib/db/client.
 * `SET search_path` is connection-local: with a pool, later statements could
 * land on a different connection and create objects in `public` instead of
 * the throwaway schema.
 */
const db = postgres(env.DATABASE_URL, {
  max: 1, prepare: false, idle_timeout: 60, connect_timeout: 60,
  onnotice: () => {}, // IF NOT EXISTS / DROP CASCADE notices are expected noise (see lib/db/client.ts)
});

async function main() {
  let failures = 0;
  const fail = (msg: string) => { failures++; console.error(`  FAIL ${msg}`); };
  const pass = (msg: string) => console.log(`  ok   ${msg}`);

  await db.unsafe(`CREATE SCHEMA ${SCHEMA}`);
  try {
    // `public` stays in the path (after the throwaway schema) so migration
    // 104's `CREATE EXTENSION IF NOT EXISTS pg_trgm` can still resolve
    // gin_trgm_ops on THIS database, which already has pg_trgm installed in
    // `public` (extensions are database-global, not per-schema). Object
    // creation is unaffected: unqualified CREATE TABLE/INDEX/MATVIEW still
    // lands in the first schema on the path that exists, i.e. ${SCHEMA}.
    // This also matches the app's real connection, which never overrides
    // search_path and so always has `public` available.
    await db.unsafe(`SET search_path TO ${SCHEMA}, public`);

    const files = (await readdir(DIR)).filter(f => f.endsWith('.sql')).sort();
    for (const f of files) {
      const body = await readFile(path.join(DIR, f), 'utf8');
      await db.unsafe(body);
    }
    console.log(`applied ${files.length} migrations into ${SCHEMA}`);

    files.includes('000_base_schema.sql')
      ? pass('000_base_schema.sql present')
      : fail('000_base_schema.sql missing from the migrations directory');

    for (const t of EXPECTED_TABLES) {
      const [row] = await db`
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = ${SCHEMA} AND table_name = ${t}`;
      row ? pass(`table ${t}`) : fail(`table ${t} missing`);
    }

    for (const v of EXPECTED_MATVIEWS) {
      const [row] = await db`
        SELECT 1 FROM pg_matviews
        WHERE schemaname = ${SCHEMA} AND matviewname = ${v}`;
      row ? pass(`matview ${v}`) : fail(`matview ${v} missing`);
    }

    // The generated tsvector column is load-bearing for search.
    const [gen] = await db`
      SELECT is_generated FROM information_schema.columns
      WHERE table_schema = ${SCHEMA} AND table_name = 'messages'
        AND column_name = 'search_vector'`;
    gen?.is_generated === 'ALWAYS'
      ? pass('messages.search_vector is GENERATED ALWAYS')
      : fail('messages.search_vector is not a generated column');

    // Idempotency: re-running 000 against a populated schema must be a no-op.
    const body = await readFile(path.join(DIR, '000_base_schema.sql'), 'utf8');
    try {
      await db.unsafe(body);
      pass('000_base_schema.sql is idempotent');
    } catch (e) {
      fail(`000_base_schema.sql is not idempotent: ${(e as Error).message}`);
    }
  } finally {
    await db.unsafe(`DROP SCHEMA ${SCHEMA} CASCADE`);
    await db.end();
  }

  console.log(failures === 0 ? '\nBOOTSTRAP OK' : `\n${failures} FAILURE(S)`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch(e => { console.error(e); process.exit(1); });
