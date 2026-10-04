import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { nameAtExport, type CastMember } from './cast';
import { localMidnightUtc, type SynthChat, type SynthExport, type SynthMessage } from './simulate';
import type { Intent } from './text';

/**
 * Render a simulated chat as Instagram "Download your information" archives —
 * the exact format the real adapter parses, so the demo exercises the real
 * ingestion path end to end:
 *   - newest message first, split across message_N.json at 10k messages
 *   - every string is UTF-8 re-read as latin-1 ("mojibake") and the JSON is
 *     ASCII-escaped, matching how Instagram actually ships exports
 *   - the whole history is labelled with each member's display name AT EXPORT
 *     TIME, so two exports straddling a rename split that member in two
 */

const PER_FILE = 10_000;

/** Instagram's encoding bug, reproduced: UTF-8 bytes emitted as latin-1 code points. */
export function mangle(text: string): string {
  return Buffer.from(text, 'utf8').toString('latin1');
}

/** JSON with every non-ASCII code unit escaped, like the real exports. */
export function asciiJson(value: unknown): string {
  return JSON.stringify(value, null, 2).replace(/[\u007f-￿]/g, c => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`);
}

type RawMessage = Record<string, unknown>;

function renderMessage(m: SynthMessage, nameOf: (id: string) => string): RawMessage {
  const raw: RawMessage = { sender_name: mangle(nameOf(m.senderId)), timestamp_ms: m.ts };
  if (m.content) raw.content = mangle(m.content);
  if (m.media) {
    const at = Math.floor(m.ts / 1000);
    if (m.media.kind === 'photo') raw.photos = [{ uri: m.media.uri, creation_timestamp: at }];
    else if (m.media.kind === 'video') raw.videos = [{ uri: m.media.uri, creation_timestamp: at }];
    else if (m.media.kind === 'audio') raw.audio_files = [{ uri: m.media.uri, creation_timestamp: at }];
    else raw.share = { link: m.media.uri };
  }
  if (m.reactions.length) {
    raw.reactions = m.reactions.map(r => ({ reaction: mangle(r.emoji), actor: mangle(nameOf(r.actorId)) }));
  }
  raw.is_geoblocked_for_viewer = false;
  return raw;
}

export type ExportFiles = { dir: string; files: string[]; messages: number };

export async function writeExport(chat: SynthChat, exp: SynthExport, outDir: string): Promise<ExportFiles> {
  const byId = new Map(chat.cast.map(m => [m.id, m]));
  const nameOf = (id: string) => nameAtExport(byId.get(id)!, exp.day);
  const cutoff = localMidnightUtc(chat.options.start, exp.day + 1);
  const included = chat.messages.filter(m => m.ts < cutoff).reverse(); // newest first

  const participants = chat.cast
    .filter(m => (m.joinDay === undefined || m.joinDay <= exp.day) && (m.leaveDay === undefined || m.leaveDay > exp.day))
    .map(m => ({ name: mangle(nameOf(m.id)) }));

  const dir = path.join(outDir, exp.date);
  await mkdir(dir, { recursive: true });
  const files: string[] = [];
  for (let i = 0; i * PER_FILE < included.length || i === 0; i++) {
    const slice = included.slice(i * PER_FILE, (i + 1) * PER_FILE);
    const file = path.join(dir, `message_${i + 1}.json`);
    await writeFile(file, asciiJson({
      participants,
      messages: slice.map(m => renderMessage(m, nameOf)),
      title: mangle(chat.options.chatName),
      is_still_participant: true,
      thread_path: 'inbox/bingeclub_1048576',
      magic_words: [],
    }));
    files.push(file);
  }
  return { dir, files, messages: included.length };
}

export type GroundTruth = {
  generator: { seed: number; start: string; days: number };
  /** Cast id → display name in the final export (what the DB will hold after merges). */
  members: Record<string, { finalName: string; names: string[]; nicknames: string[] }>;
  /** Every message with at least one intended mention. Match DB rows on (timestamp_ms, content). */
  mentions: Array<{ ts: number; content: string; senderId: string; targets: Array<{ targetId: string; alias: string; intent: Intent }> }>;
};

export function groundTruth(chat: SynthChat): GroundTruth {
  const last = chat.exports[chat.exports.length - 1]!;
  const members: GroundTruth['members'] = {};
  for (const m of chat.cast) {
    const names = [m.displayName, ...(m.renamedTo ? [m.renamedTo.name] : [])];
    members[m.id] = { finalName: nameAtExport(m, last.day), names, nicknames: m.nicknames };
  }
  return {
    generator: { seed: chat.options.seed, start: chat.options.start, days: chat.options.days },
    members,
    mentions: chat.messages
      .filter(m => m.intents.length)
      .map(m => ({ ts: m.ts, content: m.content, senderId: m.senderId, targets: m.intents })),
  };
}

/** Show metadata an admin would curate on the real site (taglines, descriptions). */
export function castSheet(cast: CastMember[], finalDay: number) {
  return cast.map(m => ({
    id: m.id, username: nameAtExport(m, finalDay), formerNames: m.renamedTo ? [m.displayName] : [],
    nicknames: m.nicknames, tagline: m.tagline, description: m.description,
  }));
}

export async function writeChat(chat: SynthChat, outDir: string): Promise<{ exports: ExportFiles[]; groundTruthFile: string; castFile: string }> {
  await mkdir(outDir, { recursive: true });
  const exports: ExportFiles[] = [];
  for (const exp of chat.exports) exports.push(await writeExport(chat, exp, outDir));
  const groundTruthFile = path.join(outDir, 'ground_truth.json');
  await writeFile(groundTruthFile, JSON.stringify(groundTruth(chat)));
  const castFile = path.join(outDir, 'cast.json');
  await writeFile(castFile, JSON.stringify(castSheet(chat.cast, chat.exports[chat.exports.length - 1]!.day), null, 2));
  return { exports, groundTruthFile, castFile };
}
