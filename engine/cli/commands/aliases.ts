import { Command } from 'commander';
import { sql } from '@/lib/db/client';

export function makeAliasesCommand(): Command {
  const cmd = new Command('aliases').description('Manage member aliases');

  cmd.command('add')
    .requiredOption('--chat <slug>')
    .requiredOption('--member <username>')
    .requiredOption('--alias <string>')
    .option('--type <type>', 'handle|real_name|nickname|roast', 'nickname')
    .action(async (opts: { chat: string; member: string; alias: string; type: string }) => {
      await sql`
        INSERT INTO member_aliases (chat_id, member_username, alias, alias_type)
        VALUES (${opts.chat}, ${opts.member}, ${opts.alias}, ${opts.type})
        ON CONFLICT (chat_id, member_username, alias) DO NOTHING`;
      console.log(`alias '${opts.alias}' -> ${opts.member} (${opts.type})`);
      await sql.end();
    });

  cmd.command('list')
    .requiredOption('--chat <slug>')
    .option('--member <username>')
    .action(async (opts: { chat: string; member?: string }) => {
      const rows = opts.member
        ? await sql`SELECT member_username, alias, alias_type FROM member_aliases WHERE chat_id = ${opts.chat} AND member_username = ${opts.member} ORDER BY alias`
        : await sql`SELECT member_username, alias, alias_type FROM member_aliases WHERE chat_id = ${opts.chat} ORDER BY member_username, alias LIMIT 200`;
      console.table(rows);
      await sql.end();
    });

  return cmd;
}
