import type { NormalizedMessage, PlatformAdapter } from './base';

export class WhatsAppAdapter implements PlatformAdapter {
  readonly platform = 'whatsapp' as const;

  async detect(_inputPath: string): Promise<boolean> {
    return false; // extension point — see the spec's PlatformAdapter guide
  }

  // eslint-disable-next-line require-yield
  async *parseArchive(_inputPath: string, _chatId: string): AsyncGenerator<NormalizedMessage> {
    throw new Error('WhatsAppAdapter not implemented');
  }
}
