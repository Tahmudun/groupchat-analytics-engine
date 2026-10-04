import { describe, expect, it } from 'vitest';
import { classifyPersona, percentileMap } from '@/lib/recap/persona';

const base = { volume: 0.5, nightOwl: 0.5, givenPerMsg: 0.5, receivedPerMsg: 0.5, sentimentGiven: 0.5, approval: 0.5, mentions: 0.5, laughShare: 0.5, capsShare: 0.5, profanityPerMsg: 0.5 };

describe('percentileMap', () => {
  it('ranks values 0..1', () => {
    const p = percentileMap(new Map([['a', 10], ['b', 20], ['c', 30]]));
    expect(p.get('a')).toBe(0);
    expect(p.get('b')).toBe(0.5);
    expect(p.get('c')).toBe(1);
  });
  it('single member gets 0.5', () => {
    expect(percentileMap(new Map([['a', 7]])).get('a')).toBe(0.5);
  });
  it('ties share one percentile, deterministic regardless of insertion order', () => {
    const p = percentileMap(new Map([['a', 10], ['b', 10], ['c', 30]]));
    expect(p.get('a')).toBe(0);
    expect(p.get('b')).toBe(0);
    expect(p.get('c')).toBe(1);
    const reordered = percentileMap(new Map([['c', 30], ['b', 10], ['a', 10]]));
    expect(reordered.get('a')).toBe(0);
    expect(reordered.get('b')).toBe(0);
    expect(reordered.get('c')).toBe(1);
  });
});

describe('classifyPersona', () => {
  it('Reality TV Villain: harsh + talked about', () => {
    expect(classifyPersona({ ...base, sentimentGiven: 0.1, mentions: 0.8 }).label).toBe('Reality TV Villain');
  });
  it('Late-Night Talk Show: night owl + high volume', () => {
    expect(classifyPersona({ ...base, nightOwl: 0.9, volume: 0.7 }).label).toBe('Late-Night Talk Show');
  });
  it('Sitcom Lead: high volume + loved', () => {
    expect(classifyPersona({ ...base, volume: 0.8, approval: 0.7 }).label).toBe('Sitcom Lead');
  });
  it('Critically Acclaimed, Barely Watched: loved + quiet', () => {
    expect(classifyPersona({ ...base, approval: 0.8, volume: 0.2 }).label).toBe('Critically Acclaimed, Barely Watched');
  });
  it('Background Extra: quiet + unmentioned', () => {
    expect(classifyPersona({ ...base, volume: 0.1, mentions: 0.1 }).label).toBe('Background Extra');
  });
  it('The Narrator: talks a lot, reacts to nothing', () => {
    expect(classifyPersona({ ...base, volume: 0.75, givenPerMsg: 0.1 }).label).toBe('The Narrator');
  });
  it('Fan Favorite: reactions rain on them', () => {
    expect(classifyPersona({ ...base, receivedPerMsg: 0.9 }).label).toBe('Fan Favorite');
  });
  it('falls back to Cult Classic', () => {
    expect(classifyPersona(base).label).toBe('Cult Classic');
  });
  it('Psychological Thriller: quiet but heavily discussed', () => {
    expect(classifyPersona({ ...base, volume: 0.2, mentions: 0.8 }).label).toBe('Psychological Thriller');
  });
  it('Antihero: harsh tongue, beloved anyway', () => {
    expect(classifyPersona({ ...base, sentimentGiven: 0.25, approval: 0.8 }).label).toBe('Antihero');
  });
  it('Action Blockbuster: all-caps energy', () => {
    expect(classifyPersona({ ...base, capsShare: 0.9, volume: 0.5 }).label).toBe('Action Blockbuster');
  });
  it('Rom-Com Lead: warmest voice, loved back', () => {
    expect(classifyPersona({ ...base, sentimentGiven: 0.85, approval: 0.7 }).label).toBe('Rom-Com Lead');
  });
  it('Live Studio Audience: laughs and reacts at everything', () => {
    expect(classifyPersona({ ...base, laughShare: 0.9, givenPerMsg: 0.7 }).label).toBe('Live Studio Audience');
  });
  it('Mockumentary: profane and hilarious', () => {
    expect(classifyPersona({ ...base, profanityPerMsg: 0.9, laughShare: 0.7 }).label).toBe('Mockumentary');
  });
});
