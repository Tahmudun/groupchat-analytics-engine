import { describe, it, expect } from 'vitest';
import {
  buildTriplePrompt, parseTripleResponse, classifyBatchWithRepair, neutralFill,
  deriveLabel, truncateContent, TRUNCATE_CHARS, REPAIR_INSTRUCTION,
  type SentimentInput,
} from '@/lib/sentiment/contract';

const batch: SentimentInput[] = [
  { message_id: 'm1', content: 'wren is actually cracked at this', targets: [{ member_username: 'wrenhollis2026', alias_matched: 'wren' }] },
  { message_id: 'm2', content: 'casper you are so washed 💀💀', targets: [{ member_username: 'jaxon_v', alias_matched: 'casper' }] },
];

describe('deriveLabel', () => {
  it('applies the ±0.15 thresholds inclusively', () => {
    expect(deriveLabel(0.15)).toBe('positive');
    expect(deriveLabel(-0.15)).toBe('negative');
    expect(deriveLabel(0.149)).toBe('neutral');
    expect(deriveLabel(-0.149)).toBe('neutral');
    expect(deriveLabel(0)).toBe('neutral');
  });
});

describe('truncateContent', () => {
  it('caps message text at TRUNCATE_CHARS', () => {
    const long = 'x'.repeat(TRUNCATE_CHARS + 50);
    expect(truncateContent(long)).toHaveLength(TRUNCATE_CHARS + 1); // + ellipsis
    expect(truncateContent('short')).toBe('short');
  });
});

describe('buildTriplePrompt', () => {
  it('numbers items, names targets, stays target-directed', () => {
    const p = buildTriplePrompt(batch);
    expect(p).toContain('1.');
    expect(p).toContain('wrenhollis2026');
    expect(p).toContain('jaxon_v');
    expect(p).toMatch(/TOWARD/);
    expect(p).toContain('[index, "target_username", score]');
  });

  it('truncates long content inside the prompt', () => {
    const long: SentimentInput = { message_id: 'm9', content: 'y'.repeat(1000), targets: [{ member_username: 'a_user', alias_matched: 'a_user' }] };
    expect(buildTriplePrompt([long]).includes('y'.repeat(TRUNCATE_CHARS + 1))).toBe(false);
  });
});

describe('parseTripleResponse', () => {
  it('parses a bare array of triples and derives labels', () => {
    const raw = JSON.stringify([[1, 'wrenhollis2026', 0.8], [2, 'jaxon_v', -0.05]]);
    const { results, missing } = parseTripleResponse(raw, batch);
    expect(missing).toEqual([]);
    expect(results[0]).toEqual({ message_id: 'm1', member_username: 'wrenhollis2026', sentiment_score: 0.8, sentiment_label: 'positive', confidence: 1 });
    expect(results[1]!.sentiment_label).toBe('neutral'); // -0.05 within dead zone
  });

  it('accepts a wrapped object (json_object mode)', () => {
    const raw = JSON.stringify({ r: [[1, 'wrenhollis2026', -0.6], [2, 'jaxon_v', 0]] });
    const { results, missing } = parseTripleResponse(raw, batch);
    expect(missing).toEqual([]);
    expect(results[0]!.sentiment_label).toBe('negative');
  });

  it('accepts an unambiguously zero-based index set', () => {
    const raw = JSON.stringify({ r: [[0, 'wren', 0.8], [1, 'casper', -0.2]] });
    const { results, missing } = parseTripleResponse(raw, batch);
    expect(missing).toEqual([]);
    expect(results.map(r => [r.message_id, r.member_username])).toEqual([
      ['m1', 'wrenhollis2026'],
      ['m2', 'jaxon_v'],
    ]);
  });

  it('clamps out-of-range scores and matches targets case-insensitively', () => {
    const raw = JSON.stringify([[1, 'WRENHOLLIS2026', 5], [2, 'jaxon_v', -3]]);
    const { results } = parseTripleResponse(raw, batch);
    expect(results[0]!.sentiment_score).toBe(1);
    expect(results[1]!.sentiment_score).toBe(-1);
    expect(results[0]!.member_username).toBe('wrenhollis2026'); // canonical casing
  });

  it('reports uncovered (index,target) pairs as missing', () => {
    const raw = JSON.stringify([[1, 'wrenhollis2026', 0.5]]);
    const { missing } = parseTripleResponse(raw, batch);
    expect(missing).toEqual([{ index: 2, member_username: 'jaxon_v' }]);
  });

  it('matches decorated usernames when the model strips punctuation/emoji (2026-07-07)', () => {
    // Models rarely echo 'Fiona.' or 'nadia🍰' verbatim — the trailing dot and
    // emoji get dropped, which used to fail the whole batch and drain to neutral.
    const decorated = [
      { message_id: 'd1', content: 'fiona is late', targets: [{ member_username: 'Fiona.', alias_matched: 'fiona' }] },
      { message_id: 'd2', content: 'nadia said no', targets: [{ member_username: 'nadia🍰', alias_matched: 'nadia' }] },
      { message_id: 'd3', content: '@qdr.88 w', targets: [{ member_username: 'qadir 🛡️', alias_matched: 'qdr.88' }] },
    ];
    const raw = JSON.stringify([[1, 'Fiona', 0.2], [2, 'nadia', 0.5], [3, 'qadir', 0.9]]);
    const { results, missing } = parseTripleResponse(raw, decorated);
    expect(missing).toEqual([]);
    expect(results.map(r => r.member_username)).toEqual(['Fiona.', 'nadia🍰', 'qadir 🛡️']);
  });

  it('matches when the model echoes the full `username (as "alias")` decoration (2026-07-07 live)', () => {
    // mistral echoed the prompt's whole target label verbatim:
    //   [7, "captain K ⚔️ (as \"kestrel\")", 0.2]
    const aliased: SentimentInput[] = [
      { message_id: 'a1', content: 'KESTREL IMPRESSED PIC', targets: [{ member_username: 'captain K ⚔️', alias_matched: 'kestrel' }] },
    ];
    const raw = JSON.stringify([[1, 'captain K ⚔️ (as "kestrel")', 0.2]]);
    const { results, missing } = parseTripleResponse(raw, aliased);
    expect(missing).toEqual([]);
    expect(results[0]!.member_username).toBe('captain K ⚔️');
  });

  it('matches when the model echoes the alias instead of the username', () => {
    const aliased: SentimentInput[] = [
      { message_id: 'a2', content: 'kestrel cooked', targets: [{ member_username: 'captain K ⚔️', alias_matched: 'kestrel' }] },
    ];
    const raw = JSON.stringify([[1, 'kestrel', 0.7]]);
    const { results, missing } = parseTripleResponse(raw, aliased);
    expect(missing).toEqual([]);
    expect(results[0]!.member_username).toBe('captain K ⚔️');
  });

  it('fuzzy-matches a mangled echo of a decorated name within the message targets (2026-07-07 live)', () => {
    // mistral echoed "erin ✨" for member "Aren ✨"
    const decorated: SentimentInput[] = [
      { message_id: 'f1', content: 'lowkey miss aren', targets: [{ member_username: 'Aren ✨', alias_matched: 'aren' }] },
    ];
    const raw = JSON.stringify([[1, 'erin ✨', 0.0]]);
    const { results, missing } = parseTripleResponse(raw, decorated);
    expect(missing).toEqual([]);
    expect(results[0]!.member_username).toBe('Aren ✨');
  });

  it('fuzzy match stays out when two targets are close to the echo (ambiguity guard)', () => {
    const twins: SentimentInput[] = [{
      message_id: 't1',
      content: 'marlo and marla beefing',
      targets: [
        { member_username: 'marlo', alias_matched: 'marlo' },
        { member_username: 'marla', alias_matched: 'marla' },
      ],
    }];
    // "marle" is distance 1 from both — must not guess
    const { missing } = parseTripleResponse(JSON.stringify([[1, 'marle', 0.5]]), twins);
    expect(missing).toHaveLength(2);
  });

  it('matches a full-name echo to exact single-word targets (2026-07-15 live)', () => {
    const compound: SentimentInput[] = [{
      message_id: 'c1',
      content: 'I like Mary Kate more',
      targets: [
        { member_username: 'Kate', alias_matched: 'Kate' },
        { member_username: 'Mary', alias_matched: 'Mary' },
      ],
    }];
    const { results, missing } = parseTripleResponse(JSON.stringify([[1, 'Mary Kate', 0.3]]), compound);
    expect(missing).toEqual([]);
    expect(results.map(r => r.member_username).sort()).toEqual(['Kate', 'Mary']);
    expect(results.every(r => r.sentiment_score === 0.3)).toBe(true);
  });

  it('matches split echoes back to a phrase target without stealing an exact target (2026-07-15 live)', () => {
    const phrase: SentimentInput[] = [{
      message_id: 'c2',
      content: 'the hat from Huey, Dewey, and Louie',
      targets: [
        { member_username: 'Huey, Dewey, and Louie', alias_matched: 'Huey, Dewey, and Louie' },
        { member_username: 'Louie', alias_matched: 'Louie' },
      ],
    }];
    const raw = JSON.stringify([[1, 'Huey', -0.1], [1, 'Dewey', -0.1], [1, 'Louie', -0.1]]);
    const { results, missing } = parseTripleResponse(raw, phrase);
    expect(missing).toEqual([]);
    expect(results.map(r => r.member_username)).toEqual(['Huey, Dewey, and Louie', 'Louie']);
  });

  it('matches a decorated short target inside a longer full-name echo', () => {
    const fullName: SentimentInput[] = [{
      message_id: 'c3',
      content: 'FUCK FIONA BYRNE',
      targets: [{ member_username: 'Fiona.', alias_matched: 'Fiona.' }],
    }];
    const { results, missing } = parseTripleResponse(JSON.stringify([[1, 'Fiona Byrne', -0.7]]), fullName);
    expect(missing).toEqual([]);
    expect(results[0]!.member_username).toBe('Fiona.');
  });

  it('uses a non-empty model label for the sole expected member (2026-07-15 live)', () => {
    const sole: SentimentInput[] = [{
      message_id: 'c4',
      content: 'k/y/s S+ tier',
      targets: [{ member_username: 'S S', alias_matched: 'S S' }],
    }];
    const { results, missing } = parseTripleResponse(JSON.stringify([[1, 'S', 0.5]]), sole);
    expect(missing).toEqual([]);
    expect(results[0]).toMatchObject({ member_username: 'S S', sentiment_score: 0.5 });
  });

  it('drops unknown indexes, unknown targets, malformed rows, duplicates', () => {
    const raw = JSON.stringify([
      [9, 'wrenhollis2026', 0.5],      // index out of batch
      [1, 'ghost', 0.5],              // not a target of m1
      ['garbage'],                    // malformed
      [2, 'jaxon_v', 0.4],
      [2, 'jaxon_v', -0.9],          // duplicate — first wins
    ]);
    const { results } = parseTripleResponse(raw, batch);
    expect(results).toHaveLength(1);
    expect(results[0]!.sentiment_score).toBe(0.4);
  });

  it('treats unparseable JSON as fully missing', () => {
    const { results, missing } = parseTripleResponse('not json', batch);
    expect(results).toEqual([]);
    expect(missing).toHaveLength(2);
  });
});

describe('classifyBatchWithRepair', () => {
  it('returns ok without repair on a complete first response', async () => {
    const outcome = await classifyBatchWithRepair(async () => JSON.stringify([[1, 'wrenhollis2026', 0.5], [2, 'jaxon_v', 0.2]]), batch);
    expect(outcome).toMatchObject({ ok: true, repaired: false });
  });

  it('repairs once with the repair instruction appended', async () => {
    const prompts: string[] = [];
    const responses = ['garbage', JSON.stringify([[1, 'wrenhollis2026', 0.5], [2, 'jaxon_v', 0.2]])];
    const outcome = await classifyBatchWithRepair(async p => { prompts.push(p); return responses.shift()!; }, batch);
    expect(outcome).toMatchObject({ ok: true, repaired: true });
    expect(prompts[1]).toContain(REPAIR_INSTRUCTION.trim());
  });

  it('fails retriable with partial results when repair still incomplete', async () => {
    const outcome = await classifyBatchWithRepair(async () => JSON.stringify([[1, 'wrenhollis2026', 0.5]]), batch);
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.partial).toHaveLength(1);
      expect(outcome.reason).toMatch(/missing 1\/2/);
    }
  });
});

describe('neutralFill', () => {
  it('fills only uncovered pairs with neutral confidence-0 rows', () => {
    const covered = [{ message_id: 'm1', member_username: 'wrenhollis2026', sentiment_score: 0.5, sentiment_label: 'positive' as const, confidence: 1 }];
    const fill = neutralFill(batch, covered);
    expect(fill).toEqual([{ message_id: 'm2', member_username: 'jaxon_v', sentiment_score: 0, sentiment_label: 'neutral', confidence: 0 }]);
  });

  it('emits ONE row per (message, member) even when the member appears under two aliases', () => {
    // regression: duplicate PKs in one upsert crashed the gemini lane
    // ("ON CONFLICT DO UPDATE command cannot affect row a second time")
    const twoAliases: SentimentInput[] = [{
      message_id: 'm7',
      content: 'dj aka the mayor strikes again',
      targets: [
        { member_username: 'jaxon_v', alias_matched: 'dj' },
        { member_username: 'jaxon_v', alias_matched: 'the mayor' },
      ],
    }];
    expect(neutralFill(twoAliases, [])).toHaveLength(1);
    const { missing } = parseTripleResponse('garbage', twoAliases);
    expect(missing).toHaveLength(1); // one expected pair, not two
  });
});
