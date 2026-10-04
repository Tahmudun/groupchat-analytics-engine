import { createHash } from 'node:crypto';

const LEGACY_CHAT = 'flix-original';

const md5 = (s: string) => createHash('md5').update(s, 'utf8').digest('hex');

/**
 * Byte-for-byte port of parser.py's make_message_id. The existing rows
 * were keyed with this formula; changing anything here silently breaks dedup.
 */
export function legacyMessageId(sender: string, timestampMs: number, content: string): string {
  return md5(`${sender}_${timestampMs}_${(content ?? '').trim()}`);
}

/**
 * Row id for the messages table. flix-original keeps the raw legacy id so new
 * exports dedup against pre-engine rows; other chats are namespaced to avoid
 * cross-chat collisions.
 */
export function messageRowId(chatId: string, platformMessageId: string): string {
  return chatId === LEGACY_CHAT ? platformMessageId : md5(`${chatId}:${platformMessageId}`);
}
