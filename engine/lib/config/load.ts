import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { parseChatConfig, type ChatConfig } from './schema';

export async function loadChatConfig(slug: string): Promise<ChatConfig> {
  const file = path.join(process.cwd(), 'chats', slug, 'config.json');
  try {
    return parseChatConfig(JSON.parse(await readFile(file, 'utf8')));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      // A missing config is legitimate for a chat that has never needed one,
      // so this is not fatal. But it is NOT harmless for flix-original: the
      // file carries aliasBlocklist, and falling back to `{ slug }` silently
      // empties it, so junk mentions flow into sentiment -> scores -> recap
      // with no error anywhere. In a container that means one missing COPY
      // corrupts the pipeline quietly, so say so loudly.
      console.warn(
        `[config] no chats/${slug}/config.json at ${file} — continuing with defaults ` +
        `(aliasBlocklist EMPTY). If this chat is meant to have a config, the mention ` +
        `resolver is now running unfiltered.`,
      );
      return { slug };
    }
    throw err;
  }
}
