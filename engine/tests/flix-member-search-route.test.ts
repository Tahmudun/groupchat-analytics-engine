import { describe, expect, it } from 'vitest';
import { GET } from '@/app/api/flix/members/search/route';

describe('GET /api/flix/members/search validation', () => {
  it('400s when q is missing', async () => {
    const res = await GET(new Request('http://local/api/flix/members/search'));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error.code).toBe('invalid_query');
  });

  it('400s when q is blank', async () => {
    const res = await GET(new Request('http://local/api/flix/members/search?q=%20%20'));
    expect(res.status).toBe(400);
  });

  it('400s when q exceeds 80 chars', async () => {
    const res = await GET(new Request(`http://local/api/flix/members/search?q=${'a'.repeat(81)}`));
    expect(res.status).toBe(400);
  });
});
