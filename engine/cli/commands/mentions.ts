import { Command } from 'commander';
import { extractMentions, type SentimentReport } from '@/lib/sentiment/run';
import { sql } from '@/lib/db/client';

export function makeMentionsCommand(): Command {
  const cmd = new Command('mentions').description('Mention extraction (local, no LLM)');
  cmd.command('extract')
    .description('Resolve member mentions into message_mentions — the admin "mentions" button, headless. Idempotent.')
    .requiredOption('--chat <slug>')
    .option('--since <date>', 'only scan messages after this ISO date')
    .action(async (opts: { chat: string; since?: string }) => {
      const report: SentimentReport = { scanned: 0, mentionMessages: 0, classified: 0, cached: 0, failed: 0 };
      await extractMentions(opts.chat, report, opts.since ? new Date(opts.since) : undefined);
      console.log(JSON.stringify({ scanned: report.scanned, mentionMessages: report.mentionMessages }, null, 2));
      await sql.end();
    });
  return cmd;
}
