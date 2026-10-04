import { describe, expect, it } from 'vitest';
import { isInstagramInAppBrowser, visibleViewportSize } from '@/lib/flix/inAppBrowser';

describe('Instagram in-app browser detection', () => {
  it.each([
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) Instagram 387.0.0.23.87',
    'Mozilla/5.0 (Linux; Android 15) AppleWebKit/537.36 [FBAN/Instagram;FBAV/387.0.0.0.1;]',
    'Mozilla/5.0 (Linux; Android 14) FB_IAB/Instagram',
  ])('recognizes %s', userAgent => {
    expect(isInstagramInAppBrowser(userAgent)).toBe(true);
  });

  it.each([
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) Version/18.5 Mobile/15E148 Safari/604.1',
    'Mozilla/5.0 (Linux; Android 15) Chrome/138.0.0.0 Mobile Safari/537.36',
    'Mozilla/5.0 [FBAN/FB4A;FBAV/500.0.0.0.1;]',
  ])('leaves non-Instagram browsers alone: %s', userAgent => {
    expect(isInstagramInAppBrowser(userAgent)).toBe(false);
  });
});

describe('visibleViewportSize', () => {
  it('uses the visual viewport when Instagram chrome makes it smaller', () => {
    expect(visibleViewportSize({ width: 390, height: 710 }, { width: 390, height: 844 }))
      .toEqual({ width: 390, height: 710 });
  });

  it('falls back for missing or invalid visual viewport measurements', () => {
    expect(visibleViewportSize(null, { width: 390, height: 844 })).toEqual({ width: 390, height: 844 });
    expect(visibleViewportSize({ width: 0, height: Number.NaN }, { width: 390, height: 844 }))
      .toEqual({ width: 390, height: 844 });
  });
});
