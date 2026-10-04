import type { PlatformAdapter } from './base';
import { InstagramAdapter } from './instagram';
import { WhatsAppAdapter } from './whatsapp';
import { DiscordAdapter } from './discord';
import { MessengerAdapter } from './messenger';

const ADAPTERS: PlatformAdapter[] = [
  new InstagramAdapter(),
  new WhatsAppAdapter(),
  new DiscordAdapter(),
  new MessengerAdapter(),
];

export async function detectAdapter(inputPath: string): Promise<PlatformAdapter> {
  for (const adapter of ADAPTERS) {
    if (await adapter.detect(inputPath)) return adapter;
  }
  throw new Error(`No platform adapter recognizes ${inputPath} (expected e.g. Instagram message_*.json files)`);
}
