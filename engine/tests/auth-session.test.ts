import { describe, expect, it } from 'vitest';
import { createToken, verifyToken, COOKIE_NAMES, MAX_AGE_SECONDS } from '@/lib/auth/session';

const SECRET = 'test-secret-please-rotate';

describe('session tokens', () => {
  it('round-trips a valid site token', async () => {
    const token = await createToken('site', SECRET);
    expect(await verifyToken(token, 'site', SECRET)).toBe(true);
  });

  it('round-trips a valid admin token', async () => {
    const token = await createToken('admin', SECRET);
    expect(await verifyToken(token, 'admin', SECRET)).toBe(true);
  });

  it('rejects an expired token', async () => {
    const past = Date.now() - (MAX_AGE_SECONDS.site + 60) * 1000;
    const token = await createToken('site', SECRET, past);
    expect(await verifyToken(token, 'site', SECRET)).toBe(false);
  });

  it('rejects a tampered signature', async () => {
    const token = await createToken('site', SECRET);
    const [kind, exp, sig] = token.split('.');
    const flipped = sig!.slice(0, -1) + (sig!.endsWith('A') ? 'B' : 'A');
    expect(await verifyToken(`${kind}.${exp}.${flipped}`, 'site', SECRET)).toBe(false);
  });

  it('rejects a token issued for the other scope', async () => {
    const token = await createToken('site', SECRET);
    expect(await verifyToken(token, 'admin', SECRET)).toBe(false);
  });

  it('rejects a token signed with another secret', async () => {
    const token = await createToken('site', 'other-secret');
    expect(await verifyToken(token, 'site', SECRET)).toBe(false);
  });

  it('rejects garbage without throwing', async () => {
    expect(await verifyToken('', 'site', SECRET)).toBe(false);
    expect(await verifyToken('a.b', 'site', SECRET)).toBe(false);
    expect(await verifyToken('site.NaN.zzz', 'site', SECRET)).toBe(false);
  });

  it('exposes the cookie contract', () => {
    expect(COOKIE_NAMES).toEqual({ site: 'flix_session', admin: 'flix_admin' });
    expect(MAX_AGE_SECONDS.site).toBe(30 * 24 * 3600);
    expect(MAX_AGE_SECONDS.admin).toBe(24 * 3600);
  });
});
