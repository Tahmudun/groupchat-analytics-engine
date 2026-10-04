import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import type { NormalizedMessage, NormalizedReaction, PlatformAdapter } from './base';
import { legacyMessageId } from '@/lib/ingestion/ids';

/** Repair Instagram's latin-1-mangled UTF-8. Port of parser.py fix_encoding. */
export function fixEncoding(text: string): string {
  try {
    const bytes = Buffer.from(text, 'latin1');
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return text; // wasn't mangled (fatal decoder threw) — return as-is
  }
}

// Port of parser.py SYSTEM_PATTERNS — order matters, anchored to avoid
// catching real messages that quote system events.
const SYSTEM_PATTERNS: Array<[RegExp, string]> = [
  [/^.+ reacted .+ to your message $/, 'system_reaction'],
  [/^.+ liked a message$/, 'system_like'],
  [/^.+ left the group\.$/, 'system_left'],
  [/^.+ added .+ to the group\.$/, 'system_added'],
  [/^.+ removed .+ from the group\.$/, 'system_removed'],
  [/^.+ named the group .+\.$/, 'system_named'],
  [/^.+ changed the group photo\.$/, 'system_photo_change'],
  [/^.+ set the nickname for .+ to .+\.$/, 'system_nickname'],
  [/^.+ set their own nickname to .+\.$/, 'system_nickname'],
  [/^.+ changed the theme using AI to "/, 'system_theme'],
  [/^.+ created a poll: .+\.$/, 'system_poll'],
  [/^.+ pinned a message\.$/, 'system_pin'],
  [/^.+ started a video chat$/, 'system_call'],
  [/^.+ sent a sticker\.$/, 'system_sticker'],
];

type RawMessage = {
  sender_name?: string;
  timestamp_ms?: number;
  content?: string;
  call_duration?: number;
  photos?: unknown[];
  videos?: unknown[];
  audio_files?: unknown[];
  share?: { link?: string };
  reactions?: Array<{ reaction?: string; actor?: string }>;
};

export function classifyMessage(msg: Pick<RawMessage, 'content' | 'call_duration'>): string {
  if (msg.call_duration !== undefined) return 'system_call';
  const content = msg.content ?? '';
  if (!content) return 'message';
  for (const [pattern, label] of SYSTEM_PATTERNS) {
    if (pattern.test(content)) return label;
  }
  return 'message';
}

function mediaType(msg: RawMessage): string | null {
  if (msg.photos) return 'photo';
  if (msg.videos) return 'video';
  if (msg.audio_files) return 'audio';
  if (msg.share) {
    const link = msg.share.link ?? '';
    if (link.includes('giphy.com')) return 'gif';
    if (link.includes('instagram.com/reel')) return 'reel';
    return 'link';
  }
  return null;
}

function isJunkRow(msg: RawMessage): boolean {
  if (msg.content) return false;
  if (msg.call_duration !== undefined) return false;
  if (msg.photos || msg.videos || msg.audio_files || msg.share) return false;
  if (msg.reactions?.length) return false;
  return true;
}

export class InstagramAdapter implements PlatformAdapter {
  readonly platform = 'instagram' as const;

  async detect(inputPath: string): Promise<boolean> {
    try {
      const files = await readdir(inputPath);
      return files.some(f => /^message_\d+\.json$/.test(f));
    } catch {
      return false;
    }
  }

  async *parseArchive(inputPath: string, chatId: string): AsyncGenerator<NormalizedMessage> {
    const files = (await readdir(inputPath))
      .filter(f => /^message_\d+\.json$/.test(f))
      .sort();
    for (const file of files) {
      // One file in memory at a time (exports split at ~10k messages/file).
      const data = JSON.parse(await readFile(path.join(inputPath, file), 'utf8')) as { messages?: RawMessage[] };
      for (const raw of data.messages ?? []) {
        if (isJunkRow(raw)) continue;

        const sender = fixEncoding(raw.sender_name ?? 'Unknown');
        const timestampMs = raw.timestamp_ms ?? 0;
        const content = fixEncoding(raw.content ?? '');
        const reactions: NormalizedReaction[] = (raw.reactions ?? []).map(r => ({
          emoji: fixEncoding(r.reaction ?? ''),
          actor: fixEncoding(r.actor ?? ''),
        }));

        yield {
          platform_message_id: legacyMessageId(sender, timestampMs, content),
          chat_id: chatId,
          sender_handle: sender,
          sender_platform_id: null,
          content,
          sent_at: new Date(timestampMs),
          timestamp_ms: timestampMs,
          message_type: classifyMessage(raw),
          media_type: mediaType(raw),
          reactions,
          reply_to_id: null, // Instagram exports carry no reply threading
          media_urls: [],
        };
      }
    }
  }
}
