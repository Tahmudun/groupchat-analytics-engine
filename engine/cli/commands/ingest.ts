import { Command } from 'commander';
import { ingestArchive } from '@/lib/ingestion/pipeline';
import { sql } from '@/lib/db/client';

export function makeIngestCommand(): Command {
  return new Command('ingest')
    .description('Parse a chat export folder and load it (idempotent, dedup-safe)')
    .requiredOption('--chat <slug>', 'target chat slug (e.g. flix-original)')
    .requiredOption('--dir <path>', 'folder containing the export (message_*.json)')
    .option('--dry-run', 'parse and count, insert nothing')
    .action(async (opts: { chat: string; dir: string; dryRun?: boolean }) => {
      const t0 = Date.now();
      const report = await ingestArchive(opts.chat, opts.dir, { dryRun: opts.dryRun });
      console.log(JSON.stringify({ ...report, took_ms: Date.now() - t0 }, null, 2));
      await sql.end();
    });
}
