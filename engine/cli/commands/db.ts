import { Command } from 'commander';
import { bootstrapDatabase } from '@/lib/db/bootstrap';
import { sql } from '@/lib/db/client';

export function makeDbCommand(): Command {
  const cmd = new Command('db').description('Database setup');
  cmd.command('bootstrap')
    .description('Create a database from scratch: base schema (if missing) + all engine migrations')
    .action(async () => {
      const report = await bootstrapDatabase();
      console.log(JSON.stringify(report, null, 2));
      await sql.end();
    });
  return cmd;
}
