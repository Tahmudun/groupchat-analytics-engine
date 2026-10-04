import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { InstagramAdapter, fixEncoding, classifyMessage } from '@/lib/adapters/instagram';
import type { NormalizedMessage } from '@/lib/adapters/base';

const FIXTURE_DIR = path.join(__dirname, 'fixtures', 'instagram');

// Derive the mangled forms exactly as Instagram creates them: proper UTF-8
// bytes misread as latin-1. Keeps control characters out of this source file.
const HEART = '❤';
const SKULL = '\u{1F480}';
const mangle = (s: string) => Buffer.from(s, 'utf8').toString('latin1');

async function collect(): Promise<NormalizedMessage[]> {
  const adapter = new InstagramAdapter();
  const out: NormalizedMessage[] = [];
  for await (const m of adapter.parseArchive(FIXTURE_DIR, 'flix-original')) out.push(m);
  return out;
}

describe('fixEncoding', () => {
  it('repairs mangled utf-8', () => {
    expect(fixEncoding(mangle(HEART))).toBe(HEART);
    expect(fixEncoding(mangle(SKULL))).toBe(SKULL);
  });
  it('leaves clean strings alone', () => {
    expect(fixEncoding('hello 💀')).toBe('hello 💀');
    expect(fixEncoding('plain ascii')).toBe('plain ascii');
  });
});

describe('classifyMessage', () => {
  it('call_duration wins over content', () => {
    expect(classifyMessage({ content: 'x left the group.', call_duration: 5 })).toBe('system_call');
  });
  it('anchored patterns do not catch quoting messages', () => {
    expect(classifyMessage({ content: 'lol he left the group. so funny' })).toBe('message');
  });
  it('classifies system_added', () => {
    expect(classifyMessage({ content: 'priya added bob to the group.' })).toBe('system_added');
  });
});

describe('InstagramAdapter.parseArchive', () => {
  it('detects an instagram export folder', async () => {
    expect(await new InstagramAdapter().detect(FIXTURE_DIR)).toBe(true);
    expect(await new InstagramAdapter().detect('/nonexistent')).toBe(false);
  });

  it('parses the fixture: 6 kept, junk skipped, types correct', async () => {
    const msgs = await collect();
    expect(msgs).toHaveLength(6);
    const types = msgs.map(m => m.message_type);
    expect(types).toEqual(['message', 'message', 'message', 'system_left', 'system_call', 'message']);
  });

  it('fixes encoding in content and reactions', async () => {
    const [first] = await collect();
    expect(first!.content).toContain(HEART);
    expect(first!.reactions).toEqual([{ emoji: SKULL, actor: 'bob' }]);
  });

  it('maps media types', async () => {
    const msgs = await collect();
    expect(msgs[1]!.media_type).toBe('photo');
    expect(msgs[2]!.media_type).toBe('reel');
  });

  it('produces legacy-compatible platform_message_id and null reply_to', async () => {
    const [first] = await collect();
    expect(first!.platform_message_id).toMatch(/^[0-9a-f]{32}$/);
    expect(first!.reply_to_id).toBeNull();
    expect(first!.timestamp_ms).toBe(1700000005000);
    expect(first!.sent_at.getTime()).toBe(1700000005000);
  });
});
