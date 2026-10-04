import { describe, expect, it } from 'vitest';
import { buildCategoryRows, customEntryCard, type WeeklyStat } from '@/lib/flix/categories';

import type { CustomEntry } from '@/lib/flix/data';

const WEEK_END = '2026-07-01';

function stat(over: Partial<WeeklyStat> & { member_username: string }): WeeklyStat {
  return {
    display_name: over.member_username,
    week_end: WEEK_END,
    first_message_at: '2025-01-01T00:00:00Z',
    last_active_at: '2026-07-01T00:00:00Z',
    messages_all_time: 5000,
    messages_7d: 100,
    messages_prev7: 100,
    reactions_7d: 50,
    weekly_score: 100,
    prev_score: 100,
    mentions_7d: 0,
    mention_sentiment_mean: null,
    mention_sentiment_stddev: null,
    hidden: false,
    avatar_url: null,
    banner_url: null,
    banner_preset: null,
    ...over,
  };
}

// A baseline pool of 6 active members so score-based rows always have ≥3.
const base = (): WeeklyStat[] =>
  ['a', 'b', 'c', 'd', 'e', 'f'].map((u, i) =>
    stat({ member_username: u, weekly_score: 100 - i * 5, prev_score: 90, messages_7d: 100 - i, reactions_7d: 40 }));

function row(rows: ReturnType<typeof buildCategoryRows>, id: string) {
  return rows.find(r => r.id === id);
}

describe('buildCategoryRows', () => {
  it('cards carry the resolved card art (its own image, frame, and fit)', () => {
    const cardArt = { url: 'data:card', frame: { x: 10, y: 20, zoom: 2 }, fit: 'contain' as const };
    const rows = buildCategoryRows([
      ...base(),
      stat({
        member_username: 'framed', weekly_score: 999,
        show_art: {
          card: cardArt,
          heroDesktop: { url: 'data:hero', frame: null, fit: 'cover' },
          heroMobile: { url: 'data:hero', frame: null, fit: 'cover' },
        },
      }),
    ]);
    expect(row(rows, 'top10')!.cards[0]!.art).toEqual(cardArt);
  });

  it('cards without resolved art fall back to the banner url as a cover crop', () => {
    const rows = buildCategoryRows([
      ...base(),
      stat({
        member_username: 'legacy', weekly_score: 999,
        banner_url: 'data:banner', poster_frame: { x: 10, y: 20, zoom: 2 },
      }),
    ]);
    expect(row(rows, 'top10')!.cards[0]!.art).toEqual({
      url: 'data:banner', frame: { x: 10, y: 20, zoom: 2 }, fit: 'cover',
    });
  });

  it('Top 10 ranks by weekly score, capped at 10', () => {
    const rows = buildCategoryRows(base());
    const top = row(rows, 'top10')!;
    expect(top.cards[0]!.username).toBe('a');
    expect(top.cards.length).toBeLessThanOrEqual(10);
  });

  it('Trending shows only positive movers, Falling only negative', () => {
    const pool = [
      ...base(),
      stat({ member_username: 'riser', weekly_score: 200, prev_score: 50, messages_7d: 80 }),
      stat({ member_username: 'faller', weekly_score: 30, prev_score: 180, messages_7d: 80 }),
    ];
    const rows = buildCategoryRows(pool);
    expect(row(rows, 'trending')!.cards[0]!.username).toBe('riser');
    expect(row(rows, 'falling')!.cards[0]!.username).toBe('faller');
    expect(row(rows, 'trending')!.cards.map(c => c.username)).not.toContain('faller');
  });

  it('Drama needs ≥5 mentions and ranks by sentiment stddev', () => {
    const pool = [
      ...base(),
      stat({ member_username: 'volatile', mentions_7d: 10, mention_sentiment_stddev: 0.9, mention_sentiment_mean: 0 }),
      stat({ member_username: 'medium', mentions_7d: 10, mention_sentiment_stddev: 0.5, mention_sentiment_mean: 0 }),
      stat({ member_username: 'steady', mentions_7d: 10, mention_sentiment_stddev: 0.1, mention_sentiment_mean: 0 }),
      stat({ member_username: 'lowdata', mentions_7d: 3, mention_sentiment_stddev: 0.99, mention_sentiment_mean: 0 }),
    ];
    const drama = row(buildCategoryRows(pool), 'drama')!;
    expect(drama.cards[0]!.username).toBe('volatile');
    expect(drama.cards.map(c => c.username)).not.toContain('lowdata');
  });

  it('Critically Acclaimed needs ≥5 mentions and ranks by mean sentiment', () => {
    const pool = [
      ...base(),
      stat({ member_username: 'beloved', mentions_7d: 8, mention_sentiment_mean: 0.8, mention_sentiment_stddev: 0.2 }),
      stat({ member_username: 'liked', mentions_7d: 8, mention_sentiment_mean: 0.4, mention_sentiment_stddev: 0.2 }),
      stat({ member_username: 'okay', mentions_7d: 8, mention_sentiment_mean: 0.1, mention_sentiment_stddev: 0.2 }),
      stat({ member_username: 'thin', mentions_7d: 2, mention_sentiment_mean: 0.99, mention_sentiment_stddev: 0.2 }),
    ];
    const acc = row(buildCategoryRows(pool), 'acclaimed')!;
    expect(acc.cards[0]!.username).toBe('beloved');
    expect(acc.cards.map(c => c.username)).not.toContain('thin');
  });

  it('Fan Favorites needs ≥20 messages and ranks by reactions per message', () => {
    const pool = [
      ...base(),
      stat({ member_username: 'ratioking', messages_7d: 40, reactions_7d: 200 }), // 5.0
      stat({ member_username: 'sparse', messages_7d: 10, reactions_7d: 90 }),      // 9.0 but <20 msgs
    ];
    const fav = row(buildCategoryRows(pool), 'fan_favorites')!;
    expect(fav.cards[0]!.username).toBe('ratioking');
    expect(fav.cards.map(c => c.username)).not.toContain('sparse');
  });

  it('Bingeworthy ranks by messages sent', () => {
    const pool = [...base(), stat({ member_username: 'chatty', messages_7d: 9999 })];
    expect(row(buildCategoryRows(pool), 'bingeworthy')!.cards[0]!.username).toBe('chatty');
  });

  it('Newly Added = first message in last 30 days AND active this week', () => {
    const pool = [
      ...base(),
      stat({ member_username: 'newbie', first_message_at: '2026-06-20T00:00:00Z', messages_7d: 40 }),
      stat({ member_username: 'newbie2', first_message_at: '2026-06-25T00:00:00Z', messages_7d: 20 }),
      stat({ member_username: 'newbie3', first_message_at: '2026-06-28T00:00:00Z', messages_7d: 10 }),
      stat({ member_username: 'newlurker', first_message_at: '2026-06-20T00:00:00Z', messages_7d: 0 }),
    ];
    const added = row(buildCategoryRows(pool), 'newly_added')!;
    expect(added.cards[0]!.username).toBe('newbie'); // most weekly messages
    expect(added.cards.map(c => c.username)).not.toContain('newlurker'); // inactive
    expect(added.cards.map(c => c.username)).not.toContain('a'); // old member
  });

  it('excludes hidden members everywhere', () => {
    const pool = base();
    pool[0]!.hidden = true; // 'a' would top several rows
    const rows = buildCategoryRows(pool);
    for (const r of rows) expect(r.cards.map(c => c.username)).not.toContain('a');
  });

  it('drops rows with fewer than 3 qualifying members', () => {
    const pool = [
      stat({ member_username: 'x', mentions_7d: 6, mention_sentiment_mean: 0.5, mention_sentiment_stddev: 0.5 }),
      stat({ member_username: 'y', mentions_7d: 0 }),
      stat({ member_username: 'z', mentions_7d: 0 }),
    ];
    // only 1 member qualifies for Drama/Acclaimed → those rows must not appear
    expect(row(buildCategoryRows(pool), 'drama')).toBeUndefined();
    expect(row(buildCategoryRows(pool), 'acclaimed')).toBeUndefined();
  });
});

function entry(over: Partial<CustomEntry>): CustomEntry {
  return {
    id: '7', title: 'Stored Title', subtitle: null,
    posterUrl: null, posterPreset: null, memberUsername: null,
    ...over,
  };
}

describe('customEntryCard', () => {
  it('member entry resolves live art, display name, and member link', () => {
    const cardArt = { url: 'data:card', frame: { x: 10, y: 20, zoom: 2 }, fit: 'contain' as const };
    const s = stat({
      member_username: 'kenji', display_name: 'kenji 🎧', banner_preset: 'ember',
      show_art: {
        card: cardArt,
        heroDesktop: { url: 'data:hero', frame: null, fit: 'cover' },
        heroMobile: { url: 'data:hero', frame: null, fit: 'cover' },
      },
    });
    const c = customEntryCard(
      entry({ memberUsername: 'kenji', subtitle: 'Has a playlist for this' }),
      new Map([['kenji', s]]),
    );
    expect(c.href).toBe('/member/kenji');
    expect(c.title).toBe('kenji 🎧');
    expect(c.caption).toBe('Has a playlist for this');
    expect(c.art).toEqual(cardArt);
    expect(c.preset).toBe('ember');
    expect(c.seed).toBe('kenji');
  });

  it('member entry without resolved show_art falls back to banner + poster crop', () => {
    const s = stat({
      member_username: 'nadia', banner_url: 'data:banner',
      poster_frame: { x: 1, y: 2, zoom: 1.5 },
    });
    const c = customEntryCard(entry({ memberUsername: 'nadia' }), new Map([['nadia', s]]));
    expect(c.art).toEqual({ url: 'data:banner', frame: { x: 1, y: 2, zoom: 1.5 }, fit: 'cover' });
  });

  it('member entry whose member no longer resolves degrades to a keyart card, no link', () => {
    const c = customEntryCard(
      entry({ memberUsername: 'gone', title: 'Old Name' }),
      new Map(),
    );
    expect(c.href).toBe('#');
    expect(c.title).toBe('Old Name');
    expect(c.art.url).toBeNull();
  });

  it('freeform entry passes stored poster/preset/subtitle through', () => {
    const c = customEntryCard(
      entry({ title: 'Bin Chicken: The Movie', subtitle: 'A true story', posterUrl: 'data:poster', posterPreset: 'noir' }),
      new Map(),
    );
    expect(c.href).toBe('#');
    expect(c.title).toBe('Bin Chicken: The Movie');
    expect(c.caption).toBe('A true story');
    expect(c.art).toEqual({ url: 'data:poster', frame: null, fit: 'cover' });
    expect(c.preset).toBe('noir');
  });

  it('entry ids stay unique per card key', () => {
    const a = customEntryCard(entry({ id: '1' }), new Map());
    const b = customEntryCard(entry({ id: '2' }), new Map());
    expect(a.key).not.toBe(b.key);
  });
});
