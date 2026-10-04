import { Command } from 'commander';
import { computeScores } from '@/lib/scoring/compute';
import { sql } from '@/lib/db/client';

export function makeScoresCommand(): Command {
  const cmd = new Command('scores').description('Member score time series');
  cmd.command('compute')
    .requiredOption('--chat <slug>')
    .option('--from <date>', 'YYYY-MM-DD inclusive')
    .option('--to <date>', 'YYYY-MM-DD inclusive')
    .action(async (opts: { chat: string; from?: string; to?: string }) => {
      const result = await computeScores(opts.chat, { from: opts.from, to: opts.to });
      console.log(JSON.stringify(result, null, 2));
      await sql.end();
    });
  return cmd;
}
