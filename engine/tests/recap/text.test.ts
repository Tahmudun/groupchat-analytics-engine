import { describe, expect, it } from 'vitest';
import { TextTally, tokenize } from '@/lib/recap/text';

it('tokenize lowercases and strips punctuation/emoji', () => {
  expect(tokenize("BRO that's CRAZY!! 💀")).toEqual(['bro', 'that', 's', 'crazy']);
});

describe('TextTally', () => {
  it('accumulates per-member and global token counts, words, messages', () => {
    const t = new TextTally();
    t.add('a', 'deadass deadass crazy');
    t.add('b', 'crazy');
    expect(t.perMember.get('a')!.tokens.get('deadass')).toBe(2);
    expect(t.perMember.get('a')!.words).toBe(3);
    expect(t.perMember.get('a')!.messages).toBe(1);
    expect(t.globalTokens.get('crazy')).toBe(2);
  });

  it('counts laugh messages once each (lmaooo variants, 💀, 😭)', () => {
    const t = new TextTally();
    t.add('a', 'LMAOOO no way');
    t.add('a', 'that is so 💀💀');
    t.add('a', 'completely serious message');
    expect(t.perMember.get('a')!.laughs).toBe(2);
  });

  it('counts shouted messages (≥8 letters, ≥80% caps)', () => {
    const t = new TextTally();
    t.add('a', 'WHY WOULD YOU DO THAT');
    t.add('a', 'ok');
    expect(t.perMember.get('a')!.caps).toBe(1);
  });

  it('counts profanity occurrences', () => {
    const t = new TextTally();
    t.add('a', 'fuck that shit');
    expect(t.perMember.get('a')!.profanity).toBe(2);
  });

  it('prune drops rare global tokens to bound memory', () => {
    const t = new TextTally();
    t.add('a', 'unique1 common');
    t.add('b', 'common');
    t.prune(2);
    expect(t.globalTokens.has('unique1')).toBe(false);
    expect(t.globalTokens.get('common')).toBe(2);
  });
});
