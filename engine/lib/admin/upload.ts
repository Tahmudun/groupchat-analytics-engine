import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import AdmZip from 'adm-zip';

/** Thrown for user-correctable upload problems (bad zip, etc.) — callers map it to a 422. */
export class InvalidUploadError extends Error {}

/** Chats whose exports predate the admin page keep their existing folder. */
const DATA_DIR_OVERRIDES: Record<string, string> = { 'flix-original': 'flix' };

export function uploadBaseDir(slug: string): string {
  return path.join(process.cwd(), '..', 'data', DATA_DIR_OVERRIDES[slug] ?? slug);
}

/** Returns a rejection reason, or null if the file looks like an Instagram export part. */
export function validateExportFile(name: string, content: Buffer): string | null {
  if (!/^message_\d+\.json$/.test(name)) return `filename must match message_<n>.json (got '${name}')`;
  let parsed: unknown;
  try {
    parsed = JSON.parse(content.toString('utf8'));
  } catch {
    return 'not valid JSON';
  }
  const obj = parsed as { messages?: unknown; participants?: unknown };
  if (!Array.isArray(obj.messages)) return "missing 'messages' array";
  if (!Array.isArray(obj.participants)) return "missing 'participants' array";
  return null;
}

/**
 * Create and return baseDir/YYYY-MM-DD; suffix -2, -3, … if taken.
 * Existing export folders are never reused (paper-trail convention).
 */
export async function datedExportDir(baseDir: string, date = new Date()): Promise<string> {
  await mkdir(baseDir, { recursive: true });
  const day = date.toISOString().slice(0, 10);
  for (let n = 1; ; n++) {
    const dir = path.join(baseDir, n === 1 ? day : `${day}-${n}`);
    try {
      await mkdir(dir);
      return dir;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'EEXIST') throw err;
    }
  }
}

/** Names appearing more than once in an upload batch (each reported once). */
export function duplicateNames(names: string[]): string[] {
  const seen = new Set<string>();
  const dups = new Set<string>();
  for (const n of names) (seen.has(n) ? dups : seen).add(n);
  return [...dups];
}

/** message_*.json entries from an export zip, directories flattened to basenames. */
export function expandZip(buf: Buffer): Array<{ name: string; content: Buffer }> {
  let zip: AdmZip;
  try {
    zip = new AdmZip(buf);
  } catch {
    throw new InvalidUploadError('not a valid zip file');
  }
  return zip
    .getEntries()
    .filter(e => !e.isDirectory && /(^|\/)message_\d+\.json$/.test(e.entryName))
    .map(e => ({ name: path.basename(e.entryName), content: e.getData() }));
}
