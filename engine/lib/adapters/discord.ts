import type { NormalizedMessage, PlatformAdapter } from './base';

export class DiscordAdapter implements PlatformAdapter {
  readonly platform = 'discord' as const;

  async detect(_inputPath: string): Promise<boolean> {
    return false; // extension point — see the spec's PlatformAdapter guide
  }

  // eslint-disable-next-line require-yield
  async *parseArchive(_inputPath: string, _chatId: string): AsyncGenerator<NormalizedMessage> {
    throw new Error('DiscordAdapter not implemented');
  }
}
