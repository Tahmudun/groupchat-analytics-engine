import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtemp, rm, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { Rng } from '@/lib/synth/rng';
import { simulate, localMidnightUtc, type SynthChat } from '@/lib/synth/simulate';
import { mangle, writeChat, groundTruth } from '@/lib/synth/export';
import { fixEncoding, InstagramAdapter } from '@/lib/adapters/instagram';
import { relationship, activityFactor, FALLOUT } from '@/lib/synth/storyline';
import { CAST } from '@/lib/synth/cast';
import { MentionResolver } from '@/lib/mentions/resolver';
import { evaluateMentions, evaluateSentiment, messageKey, truthPairs, type TruthPair } from '@/lib/synth/eval';

// a short season keeps the suite fast but still crosses the rename (day 105)
const SMALL = { seed: 42, days: 120, sessionsPerDay: 4 };

describe('Rng', () => {
  it('is deterministic per seed and forks independently', () => {
    const a = new Rng(1), b = new Rng(1);
    expect(Array.from({ length: 5 }, () => a.next())).toEqual(Array.from({ length: 5 }, () => b.next()));
    const f1 = new Rng(9).fork('x'), f2 = new Rng(9).fork('y');
    expect(f1.next()).not.toBe(f2.next());
  });

  it('weighted never picks a zero-weight item', () => {
    const r = new Rng(3);
    for (let i = 0; i < 200; i++) expect(r.weighted(['a', 'b'], x => (x === 'a' ? 0 : 1))).toBe('b');
  });
});

describe('simulate', () => {
  let chat: SynthChat;
  beforeAll(() => { chat = simulate(SMALL); });

  it('same seed → identical chat; different seed → different chat', () => {
    const hash = (c: SynthChat) => createHash('sha256').update(JSON.stringify(c.messages)).digest('hex');
    expect(hash(simulate(SMALL))).toBe(hash(chat));
    expect(hash(simulate({ ...SMALL, seed: 43 }))).not.toBe(hash(chat));
  });

  it('is chronological with no duplicate (sender, timestamp) — the dedup identity', () => {
    const keys = new Set<string>();
    for (let i = 0; i < chat.messages.length; i++) {
      const m = chat.messages[i]!;
      if (i > 0) expect(m.ts).toBeGreaterThanOrEqual(chat.messages[i - 1]!.ts);
      const k = `${m.senderId}:${m.ts}`;
      expect(keys.has(k)).toBe(false);
      keys.add(k);
    }
  });

  it('respects join/leave days', () => {
    const abby = CAST.find(m => m.id === 'abby')!;
    const firstAbby = chat.messages.find(m => m.senderId === 'abby' && !m.system);
    expect(firstAbby!.ts).toBeGreaterThanOrEqual(localMidnightUtc(chat.options.start, abby.joinDay!));
  });

  it('plans two exports straddling the rename', () => {
    expect(chat.exports.map(e => e.day)).toEqual([104, 119]);
  });

  it('every intended mention alias is in the message text', () => {
    for (const m of chat.messages) for (const i of m.intents) expect(m.content.toLowerCase()).toContain(i.alias.toLowerCase());
  });
});

describe('storyline', () => {
  it('the fallout pair is in fallout mid-arc and reconciled after', () => {
    expect(relationship(FALLOUT.a, FALLOUT.b, FALLOUT.from + 10, 0.9)).toBe('fallout');
    expect(relationship(FALLOUT.b, FALLOUT.a, FALLOUT.to + 1, 0.9)).toBe('reconciled');
    expect(relationship(FALLOUT.a, FALLOUT.b, FALLOUT.from - 1, 0.9)).toBe('close');
  });

  it('members are inactive before joining and after leaving', () => {
    expect(activityFactor('abby', 10, 38)).toBe(0);
    expect(activityFactor('felix', 151, undefined, 150)).toBe(0);
    expect(activityFactor('felix', 20, undefined, 150)).toBe(1);
  });
});

describe('Instagram export round trip', () => {
  let dir: string;
  let chat: SynthChat;
  beforeAll(async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), 'synth-'));
    chat = simulate(SMALL);
    await writeChat(chat, dir);
  });
  afterAll(() => rm(dir, { recursive: true, force: true }));

  it('mangles exactly the way fixEncoding repairs', () => {
    for (const s of ['plain', 'Maya Okafor 🌙', 'i’m wheezing 😭😭', "Danny O'Brien"]) expect(fixEncoding(mangle(s))).toBe(s);
  });

  it('the real adapter parses every message back, with the export-time name', async () => {
    const exportsOnDisk = (await readdir(dir)).filter(d => /^\d{4}-/.test(d)).sort();
    expect(exportsOnDisk).toHaveLength(2);
    const parsed = [];
    for await (const m of new InstagramAdapter().parseArchive(path.join(dir, exportsOnDisk[1]!), 'binge-club')) parsed.push(m);
    const cutoff = localMidnightUtc(chat.options.start, chat.exports[1]!.day + 1);
    expect(parsed).toHaveLength(chat.messages.filter(m => m.ts < cutoff).length);

    const senders = new Set(parsed.map(p => p.sender_handle));
    expect(senders.has('Leo Martins ⚡')).toBe(true);   // the final export relabels all of Leo's history
    expect(senders.has('Leo Martins 🦁')).toBe(false);
    expect(senders.has('Maya Okafor 🌙')).toBe(true);   // emoji survive the mojibake round trip
    const types = new Set(parsed.map(p => p.message_type));
    expect(types).toContain('system_added');
  });

  it('the earlier export carries the old name — the rename-split the merge tool fixes', async () => {
    const first = (await readdir(dir)).filter(d => /^\d{4}-/.test(d)).sort()[0]!;
    const senders = new Set<string>();
    for await (const m of new InstagramAdapter().parseArchive(path.join(dir, first), 'binge-club')) senders.add(m.sender_handle);
    expect(senders.has('Leo Martins 🦁')).toBe(true);
    expect(senders.has('Leo Martins ⚡')).toBe(false);
  });

  it('ground truth resolves through the real MentionResolver for nickname mentions', () => {
    const truth = groundTruth(chat);
    const aliases = CAST.flatMap(m => [
      { alias: truth.members[m.id]!.finalName, member_username: truth.members[m.id]!.finalName, alias_type: 'handle' },
      ...m.nicknames.map(n => ({ alias: n, member_username: truth.members[m.id]!.finalName, alias_type: 'nickname' })),
    ]);
    const resolver = new MentionResolver(aliases);
    const sample = truth.mentions.filter(m => m.targets.every(t => t.alias.length >= 3)).slice(0, 200);
    let hits = 0, total = 0;
    for (const m of sample) {
      const found = new Set(resolver.findMentions(m.content).map(x => x.member_username));
      for (const t of m.targets) { total += 1; if (found.has(truth.members[t.targetId]!.finalName)) hits += 1; }
    }
    expect(hits / total).toBeGreaterThan(0.95);
  });
});

describe('eval scoring', () => {
  const k1 = messageKey(1, 'maya is the best'), k2 = messageKey(2, 'extra mayo pls'), k3 = messageKey(3, 'pk what time');
  const truth: TruthPair[] = [
    { key: k1, member: 'Maya', alias: 'maya', intent: 'praise' },
    { key: k3, member: 'Priya', alias: 'pk', intent: 'logistics' },
  ];

  it('pair-level precision/recall with alias breakdowns', () => {
    const r = evaluateMentions(truth, [
      { key: k1, member: 'Maya', alias: 'maya' },
      { key: k1, member: 'Maya', alias: 'maya' }, // double match of one pair counts once
      { key: k2, member: 'Maya', alias: 'mayo' },
    ]);
    expect(r.truePositives).toBe(1);
    expect(r.precision).toBe(0.5);
    expect(r.recall).toBe(0.5);
    expect(r.falsePositiveAliases).toEqual([{ alias: 'mayo', count: 1 }]);
    expect(r.falseNegativeAliases).toEqual([{ alias: 'pk', count: 1 }]);
  });

  it('labels via the production thresholds, skips drains and false-positive pairs', () => {
    const [e] = evaluateSentiment(truth, [
      { key: k1, member: 'Maya', score: 0.8, model: 'm', confidence: 0.9 },
      { key: k3, member: 'Priya', score: 0, model: 'm', confidence: 0 },     // drain
      { key: k2, member: 'Maya', score: -0.9, model: 'm', confidence: 0.9 }, // no truth: ignored
    ]);
    expect(e!.evaluated).toBe(1);
    expect(e!.drains).toBe(1);
    expect(e!.accuracy).toBe(1);
    expect(e!.confusion.positive.positive).toBe(1);
  });

  it('truthPairs maps cast ids to final usernames', () => {
    const pairs = truthPairs({
      generator: { seed: 1, start: '2026-01-01', days: 1 },
      members: { leo: { finalName: 'Leo ⚡', names: ['Leo 🦁', 'Leo ⚡'], nicknames: ['leo'] } },
      mentions: [{ ts: 5, content: 'leo lets go', senderId: 'maya', targets: [{ targetId: 'leo', alias: 'leo', intent: 'praise' }] }],
    });
    expect(pairs).toEqual([{ key: messageKey(5, 'leo lets go'), member: 'Leo ⚡', alias: 'leo', intent: 'praise' }]);
  });
});
