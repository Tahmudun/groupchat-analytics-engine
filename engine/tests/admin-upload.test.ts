import { describe, it, expect } from 'vitest';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import AdmZip from 'adm-zip';
import { validateExportFile, datedExportDir, expandZip, uploadBaseDir, InvalidUploadError, duplicateNames } from '@/lib/admin/upload';

const good = Buffer.from(JSON.stringify({ participants: [{ name: 'a' }], messages: [] }));

describe('validateExportFile', () => {
  it('accepts a well-shaped instagram export file', () => {
    expect(validateExportFile('message_1.json', good)).toBeNull();
  });

  it('rejects bad filenames', () => {
    expect(validateExportFile('notes.json', good)).toMatch(/filename/);
  });

  it('rejects invalid JSON', () => {
    expect(validateExportFile('message_1.json', Buffer.from('{nope'))).toMatch(/JSON/);
  });

  it('rejects JSON without a messages array', () => {
    const bad = Buffer.from(JSON.stringify({ participants: [] }));
    expect(validateExportFile('message_1.json', bad)).toMatch(/messages/);
  });

  it('rejects JSON without a participants array', () => {
    const bad = Buffer.from(JSON.stringify({ messages: [] }));
    expect(validateExportFile('message_1.json', bad)).toMatch(/participants/);
  });
});

describe('datedExportDir', () => {
  it('creates YYYY-MM-DD and suffixes on collision', async () => {
    const base = await mkdtemp(path.join(tmpdir(), 'wrapped-upload-'));
    const date = new Date('2026-07-05T12:00:00Z');
    const first = await datedExportDir(base, date);
    expect(path.basename(first)).toBe('2026-07-05');
    const second = await datedExportDir(base, date);
    expect(path.basename(second)).toBe('2026-07-05-2');
    const third = await datedExportDir(base, date);
    expect(path.basename(third)).toBe('2026-07-05-3');
  });
});

describe('expandZip', () => {
  it('extracts only message_*.json entries, flattening directories', () => {
    const zip = new AdmZip();
    zip.addFile('inbox/chat/message_1.json', good);
    zip.addFile('inbox/chat/photos/pic.jpg', Buffer.from('x'));
    zip.addFile('message_2.json', good);
    const files = expandZip(zip.toBuffer());
    expect(files.map(f => f.name).sort()).toEqual(['message_1.json', 'message_2.json']);
  });

  it('throws InvalidUploadError on a corrupt buffer', () => {
    expect(() => expandZip(Buffer.from('not a zip at all'))).toThrow(InvalidUploadError);
    expect(() => expandZip(Buffer.from('not a zip at all'))).toThrow(/valid zip/);
  });
});

describe('uploadBaseDir', () => {
  it('maps flix-original to the legacy data/flix folder', () => {
    expect(uploadBaseDir('flix-original')).toBe(path.join(process.cwd(), '..', 'data', 'flix'));
  });

  it('uses data/<slug> for other chats', () => {
    expect(uploadBaseDir('other-chat')).toBe(path.join(process.cwd(), '..', 'data', 'other-chat'));
  });
});

describe('duplicateNames', () => {
  it('returns [] for unique names', () => {
    expect(duplicateNames(['message_1.json', 'message_2.json'])).toEqual([]);
  });

  it('returns a name once even if it appears three times', () => {
    expect(duplicateNames(['message_1.json', 'message_1.json', 'message_1.json'])).toEqual(['message_1.json']);
  });

  it('preserves multiple distinct duplicates', () => {
    const result = duplicateNames(['message_1.json', 'message_2.json', 'message_1.json', 'message_2.json']);
    expect(result.sort()).toEqual(['message_1.json', 'message_2.json']);
  });
});
