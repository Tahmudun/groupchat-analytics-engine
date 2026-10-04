import { describe, expect, it } from 'vitest';
import { normalizeFit, resolveShowArt, sameArt, type ArtSpec } from '@/lib/flix/art';

const spec = (over: Partial<ArtSpec> = {}): ArtSpec =>
  ({ url: 'data:x', frame: null, fit: 'cover', ...over });

describe('normalizeFit', () => {
  it('accepts contain, defaults everything else to cover', () => {
    expect(normalizeFit('contain')).toBe('contain');
    expect(normalizeFit('cover')).toBe('cover');
    expect(normalizeFit(null)).toBe('cover');
    expect(normalizeFit(undefined)).toBe('cover');
    expect(normalizeFit('stretch')).toBe('cover');
  });
});

describe('resolveShowArt', () => {
  it('old records (banner only) resolve all three targets to the banner', () => {
    const art = resolveShowArt({ banner_url: 'data:banner' });
    expect(art.card.url).toBe('data:banner');
    expect(art.heroDesktop.url).toBe('data:banner');
    expect(art.heroMobile.url).toBe('data:banner');
    expect(art.card.fit).toBe('cover');
  });
  it('per-target urls win over the fallback', () => {
    const art = resolveShowArt({
      banner_url: 'data:banner', card_url: 'data:card', hero_desktop_url: 'data:desk',
    });
    expect(art.card.url).toBe('data:card');
    expect(art.heroDesktop.url).toBe('data:desk');
  });
  it('mobile hero falls back desktop-first, then banner', () => {
    expect(resolveShowArt({ banner_url: 'data:b', hero_desktop_url: 'data:d' }).heroMobile.url).toBe('data:d');
    expect(resolveShowArt({ banner_url: 'data:b' }).heroMobile.url).toBe('data:b');
    expect(resolveShowArt({ banner_url: 'data:b', hero_mobile_url: 'data:m' }).heroMobile.url).toBe('data:m');
  });
  it('frames stay per-target and never cross-fall back', () => {
    const art = resolveShowArt({
      banner_url: 'data:b',
      card_frame: { x: 10, y: 20, zoom: 2 },
      hero_desktop_frame: { x: 30, y: 40, zoom: 1 },
    });
    expect(art.card.frame).toEqual({ x: 10, y: 20, zoom: 2 });
    expect(art.heroDesktop.frame).toEqual({ x: 30, y: 40, zoom: 1 });
    expect(art.heroMobile.frame).toBeNull();
  });
  it('carries fits through, normalized', () => {
    const art = resolveShowArt({ banner_url: 'data:b', hero_mobile_fit: 'contain', card_fit: 'junk' });
    expect(art.heroMobile.fit).toBe('contain');
    expect(art.card.fit).toBe('cover');
  });
  it('handles a fully empty profile (keyart everywhere)', () => {
    const art = resolveShowArt({ banner_url: null });
    expect(art.card.url).toBeNull();
    expect(art.heroMobile.url).toBeNull();
  });
});

describe('sameArt', () => {
  it('equal url/fit/frame → same (so heroes render once, not twice)', () => {
    expect(sameArt(spec(), spec())).toBe(true);
  });
  it('null frame and the default frame are the same render', () => {
    expect(sameArt(spec({ frame: null }), spec({ frame: { x: 50, y: 50, zoom: 1 } }))).toBe(true);
  });
  it('different url, fit, or frame → different', () => {
    expect(sameArt(spec(), spec({ url: 'data:y' }))).toBe(false);
    expect(sameArt(spec(), spec({ fit: 'contain' }))).toBe(false);
    expect(sameArt(spec(), spec({ frame: { x: 10, y: 50, zoom: 1 } }))).toBe(false);
  });
});
