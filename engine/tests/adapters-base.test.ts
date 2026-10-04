import { describe, it, expect } from 'vitest';
import { WhatsAppAdapter } from '@/lib/adapters/whatsapp';
import { DiscordAdapter } from '@/lib/adapters/discord';
import { MessengerAdapter } from '@/lib/adapters/messenger';

describe('adapter stubs', () => {
  it.each([
    ['whatsapp', new WhatsAppAdapter()],
    ['discord', new DiscordAdapter()],
    ['messenger', new MessengerAdapter()],
  ] as const)('%s stub declares its platform and refuses to parse', async (platform, adapter) => {
    expect(adapter.platform).toBe(platform);
    expect(await adapter.detect('/anything')).toBe(false);
    await expect(adapter.parseArchive('/anything', 'x').next()).rejects.toThrow(/not implemented/);
  });
});
