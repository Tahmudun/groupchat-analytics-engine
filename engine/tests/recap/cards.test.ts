import { describe, expect, it } from 'vitest';
import { buildCards } from '@/lib/recap/cards';
import type { RecapStats } from '@/lib/recap/types';

function minimalStats(): RecapStats {
  return {
    version: 1, member: 'quietguy',
    airtime: { messages: 3, words: 6, shareOfChat: 0.0001, rank: 90, membersRanked: 100,
      busiestDay: null, peakHour: 14, clockTag: 'daytime TV',
      longestStreakDays: 1, longestGapDays: 0, binge: null },
    reactions: { given: 0, received: 0, topGivenEmoji: null, topReceivedEmoji: null,
      biggestFan: null, theyStan: null, oneSided: null },
    script: { catchphrases: [], laughs: 0, capsShare: 0, profanityCount: 0, profanityRank: null, monologue: null },
    fame: { mentions: 0, mainCharacterDay: null, approval: null, approvalTrend: [],
      supporter: null, nemesis: null, theyPraise: null, theyRoast: null },
    persona: { label: 'Cult Classic', blurb: 'x' },
  };
}

describe('buildCards', () => {
  it('always includes intro, airtime, persona, finale', () => {
    const keys = buildCards(minimalStats(), 'quietguy').map(c => c.key);
    expect(keys).toContain('intro');
    expect(keys).toContain('airtime');
    expect(keys).toContain('persona');
    expect(keys).toContain('finale');
  });
  it('skips cards with no data (no zero-filled superlatives)', () => {
    const keys = buildCards(minimalStats(), 'quietguy').map(c => c.key);
    for (const k of ['busiest-day', 'binge', 'fans', 'catchphrase', 'monologue', 'approval', 'supporter-nemesis']) {
      expect(keys).not.toContain(k);
    }
  });
  it('busiest-day card deep-links into rewind', () => {
    const s = minimalStats();
    s.airtime.busiestDay = { date: '2026-03-14', count: 412 };
    const card = buildCards(s, 'quietguy').find(c => c.key === 'busiest-day')!;
    expect(card.link).toEqual({ kind: 'rewind', at: '2026-03-14T20:00' });
  });
  it('busiest-day card formats the date, not a raw ISO string', () => {
    const s = minimalStats();
    s.airtime.busiestDay = { date: '2026-03-14', count: 412 };
    const card = buildCards(s, 'quietguy').find(c => c.key === 'busiest-day')!;
    expect(card.sub).toBe('Mar 14');
  });
  it('binge card formats the naive local hourStart as date + hour, not raw ISO', () => {
    const s = minimalStats();
    s.airtime.binge = { hourStart: '2026-04-12T23:00:00', count: 40 };
    const card = buildCards(s, 'quietguy').find(c => c.key === 'binge')!;
    expect(card.sub).toBe('Apr 12 · 11 PM (NYC time)');
  });
  it('skips the clock card when there are zero messages', () => {
    const s = minimalStats();
    s.airtime.messages = 0;
    const keys = buildCards(s, 'quietguy').map(c => c.key);
    expect(keys).not.toContain('clock');
  });
  it('fans card carries named usernames as people for pfp+name rendering', () => {
    const s = minimalStats();
    s.reactions.biggestFan = { name: 'fanuser', count: 10 };
    s.reactions.theyStan = { name: 'stanuser', count: 5 };
    const card = buildCards(s, 'quietguy').find(c => c.key === 'fans')!;
    expect(card.people).toEqual(['fanuser', 'stanuser']);
  });
  it('describes equal reaction totals without picking a larger side', () => {
    const s = minimalStats();
    s.reactions.given = 12;
    s.reactions.received = 12;
    const card = buildCards(s, 'quietguy').find(c => c.key === 'reaction-economy')!;
    expect(card.sub).toBe('Perfectly balanced');
  });
  it('supporter-nemesis card carries named usernames as people', () => {
    const s = minimalStats();
    s.fame.supporter = { name: 'supportuser', score: 0.8, count: 12 };
    s.fame.nemesis = { name: 'nemesisuser', score: -0.5, count: 11 };
    const card = buildCards(s, 'quietguy').find(c => c.key === 'supporter-nemesis')!;
    expect(card.people).toEqual(['supportuser', 'nemesisuser']);
  });
  it('never renders the contradictory "X talks you up — X doesn\'t" from a pre-fix blob', () => {
    const s = minimalStats();
    s.fame.supporter = { name: 'quince', score: 0.3, count: 14 };
    s.fame.nemesis = { name: 'quince', score: 0.3, count: 14 };
    const card = buildCards(s, 'kev').find(c => c.key === 'supporter-nemesis')!;
    expect(card.sub).toBe('Talks you up the most');
    expect(card.sub).not.toContain("doesn't");
  });
});
