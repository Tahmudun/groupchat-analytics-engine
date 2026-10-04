import { describe, it, expect } from 'vitest';
import { loadEnv } from '@/lib/env';

describe('ADMIN_ENABLED env flag', () => {
  it('defaults to false', () => {
    const env = loadEnv({ DATABASE_URL: 'postgres://x' });
    expect(env.ADMIN_ENABLED).toBe('false');
  });

  it('accepts true', () => {
    const env = loadEnv({ DATABASE_URL: 'postgres://x', ADMIN_ENABLED: 'true' });
    expect(env.ADMIN_ENABLED).toBe('true');
  });

  it('rejects garbage values', () => {
    expect(() => loadEnv({ DATABASE_URL: 'postgres://x', ADMIN_ENABLED: 'yes' })).toThrow();
  });
});
