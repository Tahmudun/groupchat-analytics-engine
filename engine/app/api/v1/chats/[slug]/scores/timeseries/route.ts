import { requireToken } from '@/lib/api/auth';
import { ok, fail } from '@/lib/api/respond';
import { sql } from '@/lib/db/client';

const WINDOWS: Record<string, number> = { '7d': 7, '30d': 30, '90d': 90, '365d': 365, 'all': 100000 };

export async function GET(req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const denied = requireToken(req);
  if (denied) return denied;
  const { slug } = await ctx.params;
  const window = new URL(req.url).searchParams.get('window') ?? '30d';
  const days = WINDOWS[window];
  if (!days) return fail(400, 'invalid_window', `window must be one of ${Object.keys(WINDOWS).join(', ')}`);

  const [chat] = await sql`SELECT id FROM chats WHERE id = ${slug}`;
  if (!chat) return fail(404, 'chat_not_found', `no chat '${slug}'`);

  const rows = await sql`
    SELECT member_username, date, score FROM member_scores
    WHERE chat_id = ${slug}
      AND date >= ((SELECT max(date) FROM member_scores WHERE chat_id = ${slug}) - ${days}::int)
    ORDER BY member_username, date`;

  // Shape for charting: one series per member.
  const series = new Map<string, Array<{ date: string; score: number }>>();
  for (const r of rows) {
    const key = r.member_username as string;
    if (!series.has(key)) series.set(key, []);
    const day = r.date instanceof Date ? r.date.toISOString().slice(0, 10) : String(r.date);
    series.get(key)!.push({ date: day, score: r.score as number });
  }
  const data = [...series.entries()].map(([member_username, points]) => ({ member_username, points }));
  return ok(data, { window, members: data.length });
}
