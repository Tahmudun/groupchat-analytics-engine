import { describe, it, expect } from 'vitest';
import { slugify, extFor, buildMediaPath, validateMediaUpload, validateImageRef, MEDIA_KINDS } from '@/lib/flix/storage';
import { mediaUrl } from '@/lib/flix/format';

describe('slugify', () => {
  it('lowercases and dashes non-alphanumerics', () => {
    expect(slugify('Leo Martins ⚡')).toBe('leo-martins');
    expect(slugify('  Duke Orrin of Tallow  ')).toBe('duke-orrin-of-tallow');
  });
  it('never yields an empty slug', () => {
    expect(slugify('🦋🎈')).toBe('media');
    expect(slugify('')).toBe('media');
  });
  it('caps length', () => {
    expect(slugify('a'.repeat(100)).length).toBeLessThanOrEqual(40);
  });
});

describe('extFor', () => {
  it('reads the extension from the filename first', () => {
    expect(extFor('photo.PNG', 'image/jpeg')).toBe('png');
  });
  it('falls back to the content type', () => {
    expect(extFor('noext', 'image/webp')).toBe('webp');
    expect(extFor('noext', 'image/jpeg')).toBe('jpg');
  });
  it('rejects non-image extensions', () => {
    expect(() => extFor('evil.svg', 'image/svg+xml')).toThrow();
    expect(() => extFor('x.exe', 'application/octet-stream')).toThrow();
  });
});

describe('buildMediaPath', () => {
  it('assembles <chat>/<kind>/<slug>-<epoch>.<ext>', () => {
    expect(buildMediaPath('flix-original', 'avatar', 'Leo Martins', 'png', 1720000000000))
      .toBe('flix-original/avatar/leo-martins-1720000000000.png');
  });
});

describe('validateMediaUpload', () => {
  it('accepts an image under the size cap for a known kind', () => {
    expect(validateMediaUpload('banner', 'image/png', 1_000_000)).toBeNull();
  });
  it('rejects an unknown kind', () => {
    expect(validateMediaUpload('bogus', 'image/png', 100)).toMatch(/kind/);
  });
  it('rejects non-images', () => {
    expect(validateMediaUpload('avatar', 'text/plain', 100)).toMatch(/image/);
  });
  it('rejects oversized files', () => {
    expect(validateMediaUpload('poster', 'image/png', 6_000_000)).toMatch(/5\s?MB|large/i);
  });
  it('lists exactly the four kinds', () => {
    expect(MEDIA_KINDS).toEqual(['avatar', 'banner', 'poster', 'tile']);
  });
});

describe('validateImageRef', () => {
  const tinyPng = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCA',
    tinyWebp = 'data:image/webp;base64,UklGRi4AAABXRUJQ';
  it('accepts null/empty (a cleared image)', () => {
    expect(validateImageRef(null, 'avatar')).toBeNull();
    expect(validateImageRef('', 'banner')).toBeNull();
  });
  it('accepts a legacy storage path unchanged', () => {
    expect(validateImageRef('flix-original/avatar/leo-martins-1720000000000.png', 'avatar')).toBeNull();
  });
  it('accepts small inline base64 images', () => {
    expect(validateImageRef(tinyPng, 'avatar')).toBeNull();
    expect(validateImageRef(tinyWebp, 'banner')).toBeNull();
  });
  it('rejects a non-base64 or non-image data URI', () => {
    expect(validateImageRef('data:text/html;base64,PHNjcmlwdD4=', 'avatar')).toMatch(/base64/i);
    expect(validateImageRef('data:image/svg+xml;base64,PHN2Zz4=', 'avatar')).toMatch(/PNG|JPEG|WebP|GIF/);
  });
  it('rejects an inline image over the per-kind byte budget', () => {
    const huge = `data:image/webp;base64,${'A'.repeat(500_000)}`;
    expect(validateImageRef(huge, 'avatar')).toMatch(/too large/i);
    // …but the same payload fits a banner's larger budget.
    expect(validateImageRef(huge, 'banner')).toBeNull();
  });
  it("gives the login tile its own budget between pfp and poster", () => {
    const midsize = `data:image/webp;base64,${'A'.repeat(450_000)}`;
    expect(validateImageRef(midsize, 'tile')).toBeNull();
    expect(validateImageRef(midsize, 'avatar')).toMatch(/too large/i);
    const over = `data:image/webp;base64,${'A'.repeat(510_000)}`;
    expect(validateImageRef(over, 'tile')).toMatch(/too large/i);
  });
  it('applies the poster budget (between avatar and banner)', () => {
    const mid = `data:image/webp;base64,${'A'.repeat(650_000)}`;
    expect(validateImageRef(mid, 'avatar')).toMatch(/too large/i);
    expect(validateImageRef(mid, 'poster')).toBeNull();
  });
});

describe('mediaUrl', () => {
  it('passes inline data URIs through untouched', () => {
    const uri = 'data:image/webp;base64,UklGRi4AAAA';
    expect(mediaUrl(uri)).toBe(uri);
  });
  it('routes a storage path through the gated stream', () => {
    expect(mediaUrl('flix-original/avatar/x.png')).toBe('/api/media/flix-original/avatar/x.png');
  });
  it('returns null for empty input', () => {
    expect(mediaUrl(null)).toBeNull();
    expect(mediaUrl(undefined)).toBeNull();
  });
});
