import postgres from 'postgres';
import { env } from '@/lib/env';

/** FLIX home/member pages read weekly_stats + member_costars instead of
 *  aggregating 900k+ rows per request. Both only change when the pipelines
 *  run, so every pipeline tail (scores compute, ingest) calls this. Same
 *  connection discipline as refreshSearchCaches: dedicated connection,
 *  explicit SET (the Supabase pooler drops statement_timeout startup
 *  params), CONCURRENTLY so readers never block. */
export async function refreshFlixViews(): Promise<void> {
  const maint = postgres(env.DATABASE_URL, {
    max: 1,
    keep_alive: 30,
    onnotice: () => {},
  });
  try {
    await maint`SET statement_timeout = 0`;
    for (const view of ['weekly_stats', 'weekly_stats_v2', 'member_costars']) {
      await maint.unsafe(`REFRESH MATERIALIZED VIEW CONCURRENTLY ${view}`);
      await maint.unsafe(`VACUUM ANALYZE ${view}`);
    }
  } finally {
    await maint.end();
  }
}
