import { describe, it, expect } from 'vitest';
import { parseChatConfig } from '@/lib/config/schema';

describe('parseChatConfig', () => {
  it('accepts a minimal config', () => {
    expect(parseChatConfig({ slug: 'flix-original' })).toEqual({ slug: 'flix-original' });
  });

  it('rejects a slug mismatch with the filename convention', () => {
    expect(() => parseChatConfig({ slug: 'UPPER CASE' })).toThrow();
  });

  it('accepts scoring overrides and extra aliases', () => {
    const cfg = parseChatConfig({
      slug: 'flix-original',
      scoring: { ACTIVITY_WEIGHT: 0.4 },
      extraAliases: { maya: ['mayo'] },
    });
    expect(cfg.scoring?.ACTIVITY_WEIGHT).toBe(0.4);
  });
});
