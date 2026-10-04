import { describe, it, expect, vi, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { demoRefusal, isAdminPath } from '@/lib/demo';

describe('demoRefusal', () => {
  it('allows only a chat flagged synthetic', () => {
    expect(demoRefusal('binge-club', { is_synthetic: true })).toBeNull();
    expect(demoRefusal('flix-original', { is_synthetic: false })).toMatch(/not synthetic/);
    expect(demoRefusal('typo', undefined)).toMatch(/does not exist/);
  });

  it('classifies admin surfaces', () => {
    expect(isAdminPath('/admin')).toBe(true);
    expect(isAdminPath('/api/admin/members')).toBe(true);
    expect(isAdminPath('/member/x')).toBe(false);
  });
});

describe('middleware in DEMO_MODE', () => {
  afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); });

  // middleware reads env at module load, so stub first, then import fresh
  async function demoMiddleware(extraEnv: Record<string, string> = {}) {
    vi.stubEnv('DEMO_MODE', 'true');
    for (const [k, v] of Object.entries(extraEnv)) vi.stubEnv(k, v);
    vi.resetModules();
    return (await import('@/middleware')).middleware;
  }
  const req = (path: string, cookie?: string) =>
    new NextRequest(`http://localhost${path}`, cookie ? { headers: { cookie } } : undefined);

  it('404s every admin surface, page and API', async () => {
    const mw = await demoMiddleware();
    expect((await mw(req('/admin'))).status).toBe(404);
    expect((await mw(req('/api/admin/merge'))).status).toBe(404);
  });

  it('sends a first visit to the intro, then lets the visitor in', async () => {
    const mw = await demoMiddleware();
    const first = await mw(req('/'));
    expect(first.status).toBe(307);
    expect(first.headers.get('location')).toBe('http://localhost/login');
    expect((await mw(req('/', 'flix_demo_entered=1'))).status).toBe(200);
  });

  it('ignores any configured password gate — the demo is public', async () => {
    const mw = await demoMiddleware({ SESSION_SECRET: 's'.repeat(32), SITE_PASSWORD_HASH: '$argon2id$x', ADMIN_PASSWORD_HASH: '$argon2id$y' });
    expect((await mw(req('/member/someone'))).status).toBe(200);
    expect((await mw(req('/api/flix/profiles'))).status).toBe(200);
    expect((await mw(req('/admin'))).status).toBe(404);
  });
});
