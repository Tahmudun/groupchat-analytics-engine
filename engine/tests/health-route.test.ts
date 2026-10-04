import { describe, it, expect, vi, beforeEach } from 'vitest';

const query = vi.fn();
vi.mock('@/lib/db/client', () => ({
  sql: Object.assign((..._args: unknown[]) => query(), {}),
}));

beforeEach(() => { query.mockReset(); });

describe('GET /api/v1/health', () => {
  it('reports 200 and db up when the query succeeds', async () => {
    query.mockResolvedValue([{ one: 1 }]);
    const { GET } = await import('@/app/api/v1/health/route');
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.ok).toBe(true);
    expect(body.data.db).toBe('up');
    expect(typeof body.data.latencyMs).toBe('number');
  });

  it('reports 503 and db down when the query throws', async () => {
    query.mockRejectedValue(new Error('connection refused'));
    const { GET } = await import('@/app/api/v1/health/route');
    const res = await GET();
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.data.ok).toBe(false);
    expect(body.data.db).toBe('down');
  });
});
