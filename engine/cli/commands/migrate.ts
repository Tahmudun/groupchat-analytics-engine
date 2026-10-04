import { Command } from 'commander';
import { runMigrations, pendingMigrations } from '@/lib/db/migrate';
import { sql } from '@/lib/db/client';

export function makeMigrateCommand(): Command {
  return new Command('migrate')
    .description('Apply pending engine migrations (engine/supabase/migrations)')
    .option('--dry-run', 'list pending migrations without applying')
    .action(async (opts: { dryRun?: boolean }) => {
      if (opts.dryRun) {
        const pending = await pendingMigrations();
        console.log(pending.length ? `Pending:\n  ${pending.join('\n  ')}` : 'No pending migrations.');
      } else {
        const applied = await runMigrations();
        console.log(applied.length ? `Applied:\n  ${applied.join('\n  ')}` : 'Nothing to apply.');
      }
      await sql.end();
    });
}
