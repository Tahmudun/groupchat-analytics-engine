import { Command } from 'commander';
import { hash } from '@node-rs/argon2';

/** Print an argon2id hash for SITE_PASSWORD_HASH / ADMIN_PASSWORD_HASH. */
export function makeHashPasswordCommand(): Command {
  return new Command('hash-password')
    .description('argon2id-hash a password for the SITE_/ADMIN_PASSWORD_HASH env vars')
    .argument('<password>', 'the plaintext password to hash')
    .action(async (password: string) => {
      const digest = await hash(password);
      console.log(digest);
      // An argon2id digest is full of `$`, and Docker Compose interpolates `$`
      // in deploy/.env — pasting the line above verbatim delivers a TRUNCATED
      // hash to the container, which then answers "Incorrect password." to
      // every correct password with nothing in any log. Print the escaped form
      // too, so the copy-pasteable thing is also the correct thing.
      console.log();
      console.log('For deploy/.env (Docker Compose eats a bare `$` — this line is escaped):');
      console.log(`SITE_PASSWORD_HASH=${digest.replaceAll('$', '$$$$')}`);
    });
}
