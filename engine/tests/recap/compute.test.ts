import { describe, expect, it } from 'vitest';
import { clockTag, buildMemberStats, type MemberAggregates } from '@/lib/recap/compute';
import { STATS_VERSION } from '@/lib/recap/types';

describe('clockTag', () => {
  it('buckets by hour', () => {
    expect(clockTag(3)).toBe('3am poster');
    expect(clockTag(9)).toBe('morning show');
    expect(clockTag(14)).toBe('daytime TV');
    expect(clockTag(22)).toBe('primetime');
  });

  it('covers the boundary hours', () => {
    expect(clockTag(0)).toBe('3am poster');
    expect(clockTag(5)).toBe('3am poster');
    expect(clockTag(6)).toBe('morning show');
    expect(clockTag(11)).toBe('morning show');
    expect(clockTag(12)).toBe('daytime TV');
    expect(clockTag(17)).toBe('daytime TV');
    expect(clockTag(18)).toBe('primetime');
    expect(clockTag(23)).toBe('primetime');
  });
});

describe('buildMemberStats', () => {
  it('skips thin superlatives instead of zero-filling', () => {
    const agg: MemberAggregates = {
      member: 'quietguy', totalChatMessages: 1000,
      days: [{ date: '2026-01-01', count: 3 }],
      hours: new Map([[14, 3]]),
      binge: null, reactionsGiven: 0, reactionsReceived: 0,
      emojiGiven: [], emojiReceived: [], fansIn: [], fansOut: [],
      mentions: 0, mentionDays: [], approvalMean: null, approvalTrend: [],
      sentimentGivenMean: null,
      pairsIn: [], pairsOut: [], monologue: null,
      text: { tokens: new Map(), words: 6, messages: 3, laughs: 0, caps: 0, profanity: 0 },
      globalTokens: new Map(), globalWords: 100_000,
      rank: 42, membersRanked: 100, profanityRank: null,
    };
    const s = buildMemberStats(agg, { label: 'Cult Classic', blurb: 'x' });
    expect(s.version).toBe(STATS_VERSION);
    expect(s.airtime.messages).toBe(3);
    expect(s.reactions.biggestFan).toBeNull();
    expect(s.fame.supporter).toBeNull();
    expect(s.script.catchphrases).toEqual([]);
  });

  it('never crowns the same person as both supporter and nemesis', () => {
    const base: MemberAggregates = {
      member: 'kev', totalChatMessages: 1000,
      days: [{ date: '2026-01-01', count: 3 }],
      hours: new Map([[14, 3]]),
      binge: null, reactionsGiven: 0, reactionsReceived: 0,
      emojiGiven: [], emojiReceived: [], fansIn: [], fansOut: [],
      mentions: 0, mentionDays: [], approvalMean: null, approvalTrend: [],
      sentimentGivenMean: null,
      pairsIn: [], pairsOut: [], monologue: null,
      text: { tokens: new Map(), words: 6, messages: 3, laughs: 0, caps: 0, profanity: 0 },
      globalTokens: new Map(), globalWords: 100_000,
      rank: 42, membersRanked: 100, profanityRank: null,
    };
    const persona = { label: 'Cult Classic', blurb: 'x' };

    // one positive qualifying author → supporter only
    const pos = buildMemberStats({ ...base, pairsIn: [{ name: 'quince', score: 0.6, count: 14 }] }, persona);
    expect(pos.fame.supporter).toEqual({ name: 'quince', score: 0.6, count: 14 });
    expect(pos.fame.nemesis).toBeNull();

    // one negative qualifying author → nemesis only
    const neg = buildMemberStats({ ...base, pairsIn: [{ name: 'quince', score: -0.4, count: 14 }] }, persona);
    expect(neg.fame.supporter).toBeNull();
    expect(neg.fame.nemesis).toEqual({ name: 'quince', score: -0.4, count: 14 });

    // one near-neutral author → too ambivalent to crown either way
    const flat = buildMemberStats({ ...base, pairsIn: [{ name: 'quince', score: 0.01, count: 14 }] }, persona);
    expect(flat.fame.supporter).toBeNull();
    expect(flat.fame.nemesis).toBeNull();

    // the same rule protects theyPraise/theyRoast (pairsOut)
    const out = buildMemberStats({ ...base, pairsOut: [{ name: 'wren', score: 0.7, count: 20 }] }, persona);
    expect(out.fame.theyPraise).toEqual({ name: 'wren', score: 0.7, count: 20 });
    expect(out.fame.theyRoast).toBeNull();
  });

  it('fills real superlatives when the data supports them', () => {
    const agg: MemberAggregates = {
      member: 'chatty', totalChatMessages: 100,
      days: [
        { date: '2026-01-01', count: 10 },
        { date: '2026-01-02', count: 20 },
        { date: '2026-01-04', count: 5 },
      ],
      hours: new Map([[2, 5], [14, 30]]),
      binge: { hourStart: '2026-01-02T14:00:00', count: 12 },
      reactionsGiven: 40,
      reactionsReceived: 60,
      emojiGiven: [{ name: '🔥', count: 20 }, { name: '💀', count: 10 }],
      emojiReceived: [{ name: '😂', count: 35 }],
      fansIn: [{ name: 'reactor1', count: 25 }, { name: 'reactor2', count: 5 }],
      fansOut: [{ name: 'target1', count: 35 }, { name: 'target2', count: 2 }],
      mentions: 12,
      mentionDays: [{ date: '2026-01-02', count: 8 }, { date: '2026-01-01', count: 4 }],
      approvalMean: 0.5,
      approvalTrend: [{ weekStart: '2025-12-29', mean: 0.2 }, { weekStart: '2026-01-05', mean: 0.6 }],
      sentimentGivenMean: 0.3,
      pairsIn: [{ name: 'author1', score: 0.8, count: 15 }, { name: 'author2', score: -0.4, count: 12 }],
      pairsOut: [{ name: 'target1', score: 0.9, count: 20 }, { name: 'target2', score: -0.6, count: 11 }],
      monologue: { messageId: 'abc123', date: '2026-01-02', content: 'a'.repeat(150) },
      text: { tokens: new Map([['deadass', 20]]), words: 300, messages: 35, laughs: 10, caps: 2, profanity: 3 },
      globalTokens: new Map([['deadass', 40], ['the', 5000]]),
      globalWords: 10_000,
      rank: 3, membersRanked: 50, profanityRank: 2,
    };
    const s = buildMemberStats(agg, { label: 'Sitcom Lead', blurb: 'y' });

    expect(s.airtime.messages).toBe(35);
    expect(s.airtime.shareOfChat).toBe(0.35);
    expect(s.airtime.busiestDay).toEqual({ date: '2026-01-02', count: 20 });
    expect(s.airtime.peakHour).toBe(14);
    expect(s.airtime.clockTag).toBe('daytime TV');
    expect(s.airtime.longestStreakDays).toBe(2); // Jan 1-2 consecutive
    expect(s.airtime.longestGapDays).toBe(1); // Jan 3 silent between Jan 2 and Jan 4
    expect(s.airtime.binge).toEqual(agg.binge);

    expect(s.reactions.given).toBe(40);
    expect(s.reactions.received).toBe(60);
    expect(s.reactions.topGivenEmoji).toEqual({ name: '🔥', count: 20 });
    expect(s.reactions.topReceivedEmoji).toEqual({ name: '😂', count: 35 });
    expect(s.reactions.biggestFan).toEqual({ name: 'reactor1', count: 25 });
    expect(s.reactions.theyStan).toEqual({ name: 'target1', count: 35 });
    // target1: sent 35 >= 30, got (fansIn for target1) = 0 -> qualifies
    expect(s.reactions.oneSided).toEqual({ name: 'target1', sent: 35, got: 0 });

    expect(s.script.laughs).toBe(10);
    expect(s.script.capsShare).toBeCloseTo(2 / 35);
    expect(s.script.profanityCount).toBe(3);
    expect(s.script.profanityRank).toBe(2);
    expect(s.script.monologue).toEqual({
      messageId: 'abc123',
      words: 1,
      date: '2026-01-02',
      preview: 'a'.repeat(100),
    });

    expect(s.fame.mentions).toBe(12);
    expect(s.fame.mainCharacterDay).toEqual({ date: '2026-01-02', count: 8 });
    expect(s.fame.approval).toBe(75); // (0.5+1)/2*100
    expect(s.fame.approvalTrend).toEqual([
      { weekStart: '2025-12-29', approval: 60 },
      { weekStart: '2026-01-05', approval: 80 },
    ]);
    expect(s.fame.supporter).toEqual({ name: 'author1', score: 0.8, count: 15 });
    expect(s.fame.nemesis).toEqual({ name: 'author2', score: -0.4, count: 12 });
    expect(s.fame.theyPraise).toEqual({ name: 'target1', score: 0.9, count: 20 });
    expect(s.fame.theyRoast).toEqual({ name: 'target2', score: -0.6, count: 11 });

    expect(s.persona).toEqual({ label: 'Sitcom Lead', blurb: 'y' });
    expect(s.member).toBe('chatty');
    expect(s.version).toBe(STATS_VERSION);
  });

  it('nulls out a monologue whose only candidate message was empty (media-only sender)', () => {
    const agg: MemberAggregates = {
      member: 'lurker', totalChatMessages: 50,
      days: [{ date: '2026-01-01', count: 1 }],
      hours: new Map([[10, 1]]),
      binge: null, reactionsGiven: 0, reactionsReceived: 0,
      emojiGiven: [], emojiReceived: [], fansIn: [], fansOut: [],
      mentions: 0, mentionDays: [], approvalMean: null, approvalTrend: [],
      sentimentGivenMean: null,
      pairsIn: [], pairsOut: [], monologue: { messageId: 'm1', date: '2026-01-01', content: '' },
      text: { tokens: new Map(), words: 0, messages: 0, laughs: 0, caps: 0, profanity: 0 },
      globalTokens: new Map(), globalWords: 100,
      rank: 10, membersRanked: 20, profanityRank: null,
    };
    const s = buildMemberStats(agg, { label: 'Background Extra', blurb: 'z' });
    expect(s.script.monologue).toBeNull();
  });
});
