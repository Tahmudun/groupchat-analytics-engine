import { Command } from 'commander';
import { makeMigrateCommand } from './commands/migrate';
import { makeIngestCommand } from './commands/ingest';
import { makeAliasesCommand } from './commands/aliases';
import { makeSentimentCommand } from './commands/sentiment';
import { makeScoresCommand } from './commands/scores';
import { makeSearchCommand } from './commands/search';
import { makeStatusCommand } from './commands/status';
import { makeHashPasswordCommand } from './commands/hashPassword';
import { makeDbCommand } from './commands/db';
import { makeMentionsCommand } from './commands/mentions';
import { makeMembersCommand } from './commands/members';
import { makeSynthCommand } from './commands/synth';
import { makeRecapCommand } from './commands/recap';

const program = new Command('wrapped')
  .description('Groupchat Wrapped engine CLI');

program.addCommand(makeMigrateCommand());
program.addCommand(makeIngestCommand());
program.addCommand(makeAliasesCommand());
program.addCommand(makeSentimentCommand());
program.addCommand(makeScoresCommand());
program.addCommand(makeSearchCommand());
program.addCommand(makeStatusCommand());
program.addCommand(makeHashPasswordCommand());
program.addCommand(makeDbCommand());
program.addCommand(makeMentionsCommand());
program.addCommand(makeMembersCommand());
program.addCommand(makeSynthCommand());
program.addCommand(makeRecapCommand());

program.parseAsync(process.argv).catch(err => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
