import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { sql } from '@/lib/db/client';
import { ingestArchive, type IngestReport } from '@/lib/ingestion/pipeline';
import { executeMerge, type MergeResult } from '@/lib/admin/merge';
import type { castSheet } from './export';

type CastSheet = ReturnType<typeof castSheet>;

export type LoadStep =
  | { step: 'ingest'; export: string; report: IngestReport }
  | { step: 'merge'; result: MergeResult }
  | { step: 'curate'; nicknames: number; profiles: number };

/** Refuse to mix synthetic data into a database that holds a real chat. The
 *  members table is keyed by username alone, so a shared DB could also
 *  collide names across chats. */
export async function assertDemoDatabase(chatId: string): Promise<void> {
  const [row] = await sql`
    SELECT count(*)::int AS n FROM chats c
    WHERE c.id <> ${chatId} AND NOT c.is_synthetic
      AND EXISTS (SELECT 1 FROM messages m WHERE m.chat_id = c.id LIMIT 1)`;
  if ((row!.n as number) > 0) {
    throw new Error('this database already holds a real (non-synthetic) chat — load synthetic data into a separate demo database');
  }
}

export async function ensureSyntheticChat(chatId: string, name: string): Promise<void> {
  await sql`
    INSERT INTO chats (id, name, platform, is_synthetic, is_public)
    VALUES (${chatId}, ${name}, 'instagram', TRUE, TRUE)
    ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, is_synthetic = TRUE, is_public = TRUE`;
}

/** Export folders are named by date (YYYY-MM-DD); ingest oldest first, like real exports arriving over time. */
export async function exportDirs(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  return entries.filter(e => e.isDirectory() && /^\d{4}-\d{2}-\d{2}$/.test(e.name)).map(e => e.name).sort();
}

/** What an admin does by hand on the real chat: nickname aliases and show metadata. */
export async function curate(chatId: string, sheet: CastSheet): Promise<{ nicknames: number; profiles: number }> {
  const aliasRows = sheet.flatMap(m => m.nicknames.map(alias => ({
    chat_id: chatId, member_username: m.username, alias, alias_type: 'nickname',
  })));
  let nicknames = 0;
  if (aliasRows.length) {
    const r = await sql`
      INSERT INTO member_aliases ${sql(aliasRows, 'chat_id', 'member_username', 'alias', 'alias_type')}
      ON CONFLICT (chat_id, member_username, alias) DO NOTHING`;
    nicknames = r.count;
  }
  const profileRows = sheet.filter(m => m.tagline).map(m => ({
    chat_id: chatId, member_username: m.username, tagline: m.tagline, description: m.description,
  }));
  if (profileRows.length) {
    await sql`
      INSERT INTO member_profiles ${sql(profileRows, 'chat_id', 'member_username', 'tagline', 'description')}
      ON CONFLICT (chat_id, member_username) DO UPDATE SET
        tagline = EXCLUDED.tagline, description = EXCLUDED.description, updated_at = now()`;
  }
  return { nicknames, profiles: profileRows.length };
}

/**
 * Load a generated chat exactly the way the real one was built: each export
 * through the production ingest path (dedup handles the overlap), then the
 * merge tool folds rename-split members back together, then curation.
 */
export async function loadSyntheticChat(
  chatId: string,
  name: string,
  dir: string,
  onStep: (s: LoadStep) => void = () => {},
): Promise<LoadStep[]> {
  await assertDemoDatabase(chatId);
  await ensureSyntheticChat(chatId, name);
  const sheet = JSON.parse(await readFile(path.join(dir, 'cast.json'), 'utf8')) as CastSheet;

  const steps: LoadStep[] = [];
  const record = (s: LoadStep) => { steps.push(s); onStep(s); };

  for (const exp of await exportDirs(dir)) {
    record({ step: 'ingest', export: exp, report: await ingestArchive(chatId, path.join(dir, exp)) });
  }
  for (const m of sheet.filter(x => x.formerNames.length)) {
    record({ step: 'merge', result: await executeMerge(chatId, m.username, m.formerNames) });
  }
  record({ step: 'curate', ...(await curate(chatId, sheet)) });
  return steps;
}
