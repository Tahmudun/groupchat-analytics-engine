import { Command } from 'commander';
import { SearchBodySchema, searchMessages } from '@/lib/search/query';
import { sql } from '@/lib/db/client';

export function makeSearchCommand(): Command {
  return new Command('search')
    .description('Test the search pipeline from the terminal')
    .argument('<query>', 'search text')
    .option('--chat <slug>', 'chat slug', 'flix-original')
    .option('--filter <key:value...>', 'e.g. --filter sender:someuser min_reactions:5')
    .option('--sort <order>', 'newest|oldest|relevance|most_reactions', 'relevance')
    .option('--limit <n>', 'results', v => parseInt(v, 10), 10)
    .action(async (query: string, opts: { chat: string; filter?: string[]; sort: string; limit: number }) => {
      const filters: Record<string, unknown> = {};
      for (const f of opts.filter ?? []) {
        const [k, v] = f.split(':', 2);
        if (k && v !== undefined) filters[k] = k === 'min_reactions' ? Number(v) : k === 'has_media' ? v === 'true' : v;
      }
      const body = SearchBodySchema.parse({ query, filters, sort: opts.sort, limit: opts.limit });
      const out = await searchMessages(opts.chat, body);
      console.log(JSON.stringify(out, null, 2));
      await sql.end();
    });
}
