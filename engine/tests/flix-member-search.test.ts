import { describe, expect, it } from 'vitest';
import { escapeLike, memberSearchCardFromRow } from '@/lib/flix/data';

describe('escapeLike', () => {
  it('escapes ILIKE wildcards and backslashes', () => {
    expect(escapeLike('mor')).toBe('mor');
    expect(escapeLike('100%_\\')).toBe('100\\%\\_\\\\');
  });
});

describe('memberSearchCardFromRow', () => {
  const base = {
    member_username: 'kenji',
    display_name: 'kenji ⚡',
    banner_preset: 'sunset',
    banner_url: null, card_url: null, card_fit: null,
    poster_focus_x: null, poster_focus_y: null, poster_zoom: null,
  };

  it('maps a no-art member to a null-url card with preset', () => {
    const c = memberSearchCardFromRow(base);
    expect(c).toEqual({
      username: 'kenji',
      displayName: 'kenji ⚡',
      preset: 'sunset',
      art: { url: null, frame: null, fit: 'cover' },
    });
  });

  it('falls back to banner_url when card_url is missing and maps the poster crop', () => {
    const c = memberSearchCardFromRow({
      ...base,
      banner_url: 'data:image/webp;base64,xyz',
      poster_focus_x: 50, poster_focus_y: 10, poster_zoom: 1.4,
    });
    expect(c.art.url).toBe('data:image/webp;base64,xyz');
    expect(c.art.frame).toEqual({ x: 50, y: 10, zoom: 1.4 });
  });

  it('prefers card_url over banner_url and respects contain fit', () => {
    const c = memberSearchCardFromRow({
      ...base,
      banner_url: 'data:image/webp;base64,banner',
      card_url: 'data:image/webp;base64,card',
      card_fit: 'contain',
    });
    expect(c.art.url).toBe('data:image/webp;base64,card');
    expect(c.art.fit).toBe('contain');
  });
});
