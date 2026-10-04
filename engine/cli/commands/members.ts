import { Command } from 'commander';
import { findMergeSuggestions } from '@/lib/admin/mergeSuggestions';
import { previewMerge, executeMerge, validateMergeInput } from '@/lib/admin/merge';
import { sql } from '@/lib/db/client';

export function makeMembersCommand(): Command {
  const cmd = new Command('members').description('Member identity: rename-split detection and merges');

  cmd.command('suggest')
    .description('List likely-duplicate members (display-name drift), by trigram similarity')
    .requiredOption('--chat <slug>')
    .option('--threshold <n>', 'minimum similarity 0–1', v => parseFloat(v), 0.4)
    .action(async (opts: { chat: string; threshold: number }) => {
      console.log(JSON.stringify(await findMergeSuggestions(opts.chat, opts.threshold), null, 2));
      await sql.end();
    });

  cmd.command('merge')
    .description('Fold source members into a canonical member — the admin merge panel, headless')
    .requiredOption('--chat <slug>')
    .requiredOption('--into <username>', 'canonical member (kept)')
    .requiredOption('--from <usernames...>', 'member(s) folded in and retired')
    .option('--dry-run', 'print the impact preview without writing')
    .action(async (opts: { chat: string; into: string; from: string[]; dryRun?: boolean }) => {
      const invalid = validateMergeInput(opts.into, opts.from);
      if (invalid) {
        console.error(invalid);
        process.exitCode = 1;
      } else if (opts.dryRun) {
        console.log(JSON.stringify(await previewMerge(opts.chat, opts.into, opts.from), null, 2));
      } else {
        const result = await executeMerge(opts.chat, opts.into, opts.from, p => console.error(`  ${p.label}`));
        console.log(JSON.stringify(result, null, 2));
      }
      await sql.end();
    });

  return cmd;
}
