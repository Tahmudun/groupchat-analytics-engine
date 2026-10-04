import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { sql } from '@/lib/db/client';

const MIGRATIONS_DIR = path.join(process.cwd(), 'supabase', 'migrations');

export function selectPending(files: string[], applied: Set<string>): string[] {
  return files.filter(f => f.endsWith('.sql') && !applied.has(f)).sort();
}

async function ensureTrackingTable(): Promise<void> {
  await sql`CREATE TABLE IF NOT EXISTS engine_migrations (
    filename   TEXT PRIMARY KEY,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`;
}

export async function pendingMigrations(dir: string = MIGRATIONS_DIR): Promise<string[]> {
  await ensureTrackingTable();
  const files = await readdir(dir);
  const rows = await sql`SELECT filename FROM engine_migrations`;
  return selectPending(files, new Set(rows.map(r => r.filename as string)));
}

export async function runMigrations(dir: string = MIGRATIONS_DIR): Promise<string[]> {
  const pending = await pendingMigrations(dir);
  const applied: string[] = [];
  for (const filename of pending) {
    const body = await readFile(path.join(dir, filename), 'utf8');
    // Each migration runs in a transaction with its tracking row, so a
    // failure leaves nothing half-applied.
    await sql.begin(async tx => {
      await tx.unsafe(body);
      await tx`INSERT INTO engine_migrations (filename) VALUES (${filename})`;
    });
    applied.push(filename);
  }
  return applied;
}
