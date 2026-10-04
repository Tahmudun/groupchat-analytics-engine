export type NormalizedReaction = { emoji: string; actor: string };

export type NormalizedMessage = {
  platform_message_id: string;
  chat_id: string;
  sender_handle: string;
  sender_platform_id: string | null;
  content: string;
  sent_at: Date;
  timestamp_ms: number;
  message_type: string;
  media_type: string | null;
  reactions: NormalizedReaction[];
  reply_to_id: string | null;
  media_urls: string[];
};

export interface PlatformAdapter {
  platform: 'instagram' | 'whatsapp' | 'discord' | 'messenger';
  /** Cheap structural sniff: does this path look like this platform's export? */
  detect(inputPath: string): Promise<boolean>;
  /** Streaming parse — yields messages one at a time for memory efficiency. */
  parseArchive(inputPath: string, chatId: string): AsyncGenerator<NormalizedMessage>;
}
