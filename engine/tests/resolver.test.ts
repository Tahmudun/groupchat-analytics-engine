import { describe, it, expect } from 'vitest';
import { MentionResolver } from '@/lib/mentions/resolver';

const aliases = [
  { alias: 'wrenhollis2026', member_username: 'wrenhollis2026', alias_type: 'handle' },
  { alias: 'Wren', member_username: 'wrenhollis2026', alias_type: 'real_name' },
  { alias: 'the mayor', member_username: 'jaxon_v', alias_type: 'nickname' },
  { alias: 'DJ', member_username: 'dj_demo', alias_type: 'nickname' },
];

describe('MentionResolver', () => {
  const r = new MentionResolver(aliases);

  it('finds an exact single-word mention, case-insensitive, with offset', () => {
    const m = r.findMentions('yo wren come here');
    expect(m).toEqual([{ member_username: 'wrenhollis2026', alias_matched: 'Wren', confidence: 1, offset_in_message: 3 }]);
  });

  it('finds multi-word aliases', () => {
    const m = r.findMentions('the mayor is at it again');
    expect(m[0]!.member_username).toBe('jaxon_v');
    expect(m[0]!.offset_in_message).toBe(0);
  });

  it('fuzzy-matches typos on long handles at 0.7 confidence', () => {
    const m = r.findMentions('wrenholis2026 said what');
    expect(m).toEqual([{ member_username: 'wrenhollis2026', alias_matched: 'wrenhollis2026', confidence: 0.7, offset_in_message: 0 }]);
  });

  it('does NOT fuzzy-match short-word aliases (2026-07-07: finna→Fiona., every→Avery)', () => {
    // 'wrens' is distance 1 from 'Wren' but short tokens collide with
    // common words at scale — fuzzy now requires 8+ chars.
    expect(r.findMentions('wrens said what')).toEqual([]);
  });

  it('does NOT fuzzy-match short aliases', () => {
    expect(r.findMentions('dja whatever')).toEqual([]); // 'DJ' is exact-only
  });

  it('does not match inside words', () => {
    expect(r.findMentions('wrench vibes everywhere')).toEqual([]);
  });

  it('dedupes: one member max once per token position', () => {
    const m = r.findMentions('wren Wren');
    expect(m).toHaveLength(2); // two positions, two mentions
  });
});

describe('MentionResolver alias usability policy (live-data lesson)', () => {
  const r = new MentionResolver([
    { alias: 'A', member_username: 'a_member', alias_type: 'handle' },
    { alias: 'Him', member_username: 'him_member', alias_type: 'nickname' },
    { alias: 'tears', member_username: 'tears_member', alias_type: 'nickname' },
    { alias: ':))', member_username: 'smiley', alias_type: 'handle' },
    { alias: 'thane', member_username: 'thane_member', alias_type: 'handle' },
  ]);

  it('never matches single-letter or stopword aliases', () => {
    expect(r.findMentions('a way to see him through tears')).toEqual([]);
  });

  it('never matches punctuation-only aliases', () => {
    expect(r.findMentions('haha :)) nice')).toEqual([]);
  });

  it('does not fuzzy-match stopword tokens against handles', () => {
    expect(r.findMentions('thanks everyone')).toEqual([]); // not thane
  });

  it('still exact-matches a real handle', () => {
    expect(r.findMentions('where is thane')).toHaveLength(1);
  });
});

describe('MentionResolver fuzzy tightening (live-data lesson)', () => {
  const r = new MentionResolver([
    { alias: 'Corvin', member_username: 'corvin_member', alias_type: 'nickname' },
    { alias: 'Lucie', member_username: 'lucie_member', alias_type: 'handle' },
    { alias: 'girl1', member_username: 'girl1_member', alias_type: 'handle' },
    { alias: 'wrenhollis2026', member_username: 'wrenhollis2026', alias_type: 'handle' },
  ]);

  it('rejects distance-2 matches on short tokens', () => {
    expect(r.findMentions('wrong cousin')).toEqual([]);  // cousin !-> Corvin
    expect(r.findMentions('Lucky day')).toEqual([]);     // lucky !-> Lucie
  });

  it('rejects plural stopwords against handles', () => {
    expect(r.findMentions('some girls here')).toEqual([]); // girls !-> girl1
  });

  it('exact-matches short names but no longer fuzzes them', () => {
    expect(r.findMentions('lucie is here')).toHaveLength(1);
    expect(r.findMentions('lcuie is here')).toEqual([]); // 5 chars — below the fuzzy floor now
  });

  it('allows distance 1 on long handles', () => {
    expect(r.findMentions('wrenholis2026 lol')).toHaveLength(1);
  });
});

describe('MentionResolver 2026-07-07 live-data lessons (new-member name collisions)', () => {
  const r = new MentionResolver([
    { alias: 'Fiona.', member_username: 'Fiona.', alias_type: 'handle' },
    { alias: 'Avery', member_username: 'Avery', alias_type: 'handle' },
    { alias: 'christa', member_username: 'christa', alias_type: 'handle' },
    { alias: 'Batara', member_username: 'Batara', alias_type: 'handle' },
    { alias: 'nadia🍰', member_username: 'nadia🍰', alias_type: 'handle' },
    { alias: 'Casper 😨', member_username: 'Casper 😨', alias_type: 'handle' },
    { alias: 'pixel_haze420', member_username: 'lanternfish', alias_type: 'handle' },
  ]);

  it('common words never fuzzy-match member names', () => {
    expect(r.findMentions('im finna bust')).toEqual([]);          // finna !-> Fiona.
    expect(r.findMentions('every single day')).toEqual([]);       // every !-> Avery
    expect(r.findMentions('merry christmas everyone')).toEqual([]); // christmas !-> christa (distance 2)
    expect(r.findMentions('you absolute bastard lol')).toEqual([]); // bastard !-> Batara (distance 2)
  });

  it('long-handle typos still fuzzy-match', () => {
    const m = r.findMentions('@pixel_haze42o I fw you');
    expect(m).toHaveLength(1);
    expect(m[0]!.member_username).toBe('lanternfish');
    expect(m[0]!.confidence).toBe(0.7);
  });

  it('decorated names are exact-matchable by their stripped form', () => {
    expect(r.findMentions('fiona is late again')).toHaveLength(1);   // 'Fiona.' via stripped 'fiona'
    expect(r.findMentions('nadia said no')).toHaveLength(1);        // 'nadia🍰' via stripped 'nadia'
    expect(r.findMentions('classic casper move')).toHaveLength(1);   // 'Casper 😨' via stripped 'casper'
  });

  it('stripped variants still report the original alias', () => {
    const m = r.findMentions('fiona is late again');
    expect(m[0]!.alias_matched).toBe('Fiona.');
  });

  it("negation contractions never match ('aren't' is not Aren)", () => {
    // 2026-07-07 live: member 'Aren ✨' collected 1.3k junk mentions
    // because the tokenizer split "aren't" at the apostrophe.
    const withAren = new MentionResolver([
      { alias: 'Aren ✨', member_username: 'Aren ✨', alias_type: 'handle' },
    ]);
    expect(withAren.findMentions("we aren't done yet")).toEqual([]);
    expect(withAren.findMentions('they aren’t here yet')).toEqual([]); // curly quote too
    expect(withAren.findMentions('aren is late again')).toHaveLength(1); // standalone still real
  });

  it("possessives still match ('casper's takes' is about casper)", () => {
    expect(r.findMentions("casper's takes are wild")).toHaveLength(1);
  });

  it('blocklist blocks stripped variants too', () => {
    const blocked = new MentionResolver(
      [{ alias: 'Sky 🌀', member_username: 'Sky 🌀', alias_type: 'handle' }],
      ['sky'],
    );
    expect(blocked.findMentions('sky high prices')).toEqual([]);
  });
});
