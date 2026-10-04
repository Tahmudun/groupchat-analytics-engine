import { Command } from 'commander';
import { computeRecap } from '@/lib/recap/compute';
import { sql } from '@/lib/db/client';

export function makeRecapCommand(): Command {
  const cmd = new Command('recap').description('Member Recap (Wrapped-style) stat blobs');
  cmd.command('compute')
    .requiredOption('--chat <slug>')
    .action(async (opts: { chat: string }) => {
      const result = await computeRecap(opts.chat, {
        onProgress: p => process.stdout.write(`\r${p.label} ${p.done}${p.total ? `/${p.total}` : ''}   `),
      });
      console.log('\n' + JSON.stringify(result, null, 2));
      await sql.end();
    });
  return cmd;
}
