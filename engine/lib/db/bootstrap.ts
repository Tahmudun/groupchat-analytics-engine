import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { sql } from '@/lib/db/client';
import { runMigrations } from '@/lib/db/migrate';

/** The legacy base schema (messages/reactions/members/site_stats + v0 RPCs).
 *  Engine migrations 100+ are additive on top of it. */
const BASE_SCHEMA = path.join(process.cwd(), '..', 'search-engine', 'supabase', 'schema.sql');

export type BootstrapReport = { baseSchemaApplied: boolean; migrationsApplied: string[] };

/**
 * Build a working database from nothing: base schema (only when `messages`
 * is missing — schema.sql is idempotent, but there's no reason to replay it
 * on a live DB) then every pending engine migration. Works on plain Postgres
 * (local, Neon, a VPS) as well as Supabase.
 */
export async function bootstrapDatabase(): Promise<BootstrapReport> {
  const [row] = await sql`SELECT to_regclass('public.messages') IS NOT NULL AS exists`;
  let baseSchemaApplied = false;
  if (!row!.exists) {
    const body = await readFile(BASE_SCHEMA, 'utf8');
    await sql.begin(async tx => { await tx.unsafe(body); });
    baseSchemaApplied = true;
  }
  const migrationsApplied = await runMigrations();
  return { baseSchemaApplied, migrationsApplied };
}
