import { describe, it, expect } from 'vitest';
import { buildChecksumQuery, compareParity, PARITY_TABLES } from '@/lib/migration/parity';

describe('PARITY_TABLES', () => {
  it('covers every table holding irreplaceable data', () => {
    const names = PARITY_TABLES.map(t => t.table);
    for (const t of [
      'messages', 'reactions', 'members', 'member_scores',
      'member_recap', 'mention_sentiments', 'message_mentions',
      'member_aliases', 'member_profiles', 'chats',
      'custom_categories', 'custom_category_entries',
    ]) {
      expect(names).toContain(t);
    }
  });

  it('checksums every curated artwork column on member_profiles', () => {
    const profiles = PARITY_TABLES.find(t => t.table === 'member_profiles')!;
    for (const c of ['avatar_url', 'tile_url', 'banner_url', 'card_url',
                     'hero_desktop_url', 'hero_mobile_url']) {
      expect(profiles.columns).toContain(c);
    }
  });

  // A restore that nulls or truncates `stats` while leaving chat_id/
  // member_username/stats_version intact must still be caught: `stats` is
  // the entire Recap payload (migration 112), not metadata about it.
  it('checksums the member_recap JSONB stats payload, not just its version', () => {
    const recap = PARITY_TABLES.find(t => t.table === 'member_recap')!;
    expect(recap.columns).toContain('stats');
  });

  // Hand-tuned crop focal points/zoom/fit mode (migrations 108/109/110) are
  // curated data with no other source of truth — a restore that silently
  // reset them to column defaults must be caught, same as a dropped image.
  it('checksums every curated crop/frame/fit column on member_profiles', () => {
    const profiles = PARITY_TABLES.find(t => t.table === 'member_profiles')!;
    for (const c of [
      'banner_preset',
      'banner_focus_x', 'banner_focus_y', 'banner_zoom',
      'poster_focus_x', 'poster_focus_y', 'poster_zoom',
      'card_fit', 'hero_desktop_fit', 'hero_mobile_fit',
      'hero_mobile_focus_x', 'hero_mobile_focus_y', 'hero_mobile_zoom',
    ]) {
      expect(profiles.columns).toContain(c);
    }
  });

  // Same defect one table over: custom-row posters are inline data-URI uploads
  // (session 14) with no source of truth other than this row.
  it('checksums the custom_category_entries poster upload', () => {
    const entries = PARITY_TABLES.find(t => t.table === 'custom_category_entries')!;
    expect(entries.columns).toContain('poster_url');
  });

  it('names at least one column for every table', () => {
    for (const t of PARITY_TABLES) expect(t.columns.length).toBeGreaterThan(0);
  });
});

describe('buildChecksumQuery', () => {
  it('produces a null-safe aggregate over the named table', () => {
    const q = buildChecksumQuery({ table: 'members', columns: ['username', 'alias'] });
    expect(q).toContain('FROM members');
    expect(q).toContain('md5');
    // Null-safe: a NULL column must not swallow the whole concatenation.
    expect(q).toContain('coalesce');
  });

  it('never sorts — the source database is metered and messages has ~1M rows', () => {
    const q = buildChecksumQuery({ table: 'messages', columns: ['id', 'content'] });
    expect(q).not.toContain('ORDER BY');
    expect(q).not.toContain('string_agg');
  });
});

describe('compareParity', () => {
  const src = [{ table: 'messages', n: 10, checksum: 'abc' }];

  it('passes when both sides match', () => {
    expect(compareParity(src, [{ table: 'messages', n: 10, checksum: 'abc' }])).toEqual([]);
  });

  it('flags a row-count mismatch', () => {
    const d = compareParity(src, [{ table: 'messages', n: 9, checksum: 'abc' }]);
    expect(d).toHaveLength(1);
    expect(d[0]!.reason).toBe('row-count');
  });

  it('flags a checksum mismatch even when counts agree', () => {
    const d = compareParity(src, [{ table: 'messages', n: 10, checksum: 'zzz' }]);
    expect(d).toHaveLength(1);
    expect(d[0]!.reason).toBe('checksum');
  });

  it('flags a table missing from the target entirely', () => {
    const d = compareParity(src, []);
    expect(d).toHaveLength(1);
    expect(d[0]!.reason).toBe('missing');
  });
});
