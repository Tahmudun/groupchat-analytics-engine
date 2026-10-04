import postgres from 'postgres';
import { env } from '@/lib/env';
import { chunk } from '@/lib/ingestion/pipeline';
import { refreshFlixViews } from '@/lib/flix/refresh';
import {
  SCORING_VERSION, composeScore, activityComponent, sentimentComponent,
  reactionComponent, engagementComponent, longevityComponent, messageWeight,
} from './formula';

type Sql = ReturnType<typeof postgres>;

export type ScoresProgress = { windowsDone: number; windowsTotal: number; rowsWritten: number };

export async function computeScores(
  chatId: string,
  opts: { from?: string; to?: string; onProgress?: (p: ScoresProgress) => void } = {},
): Promise<{ days: number; rowsWritten: number }> {
  // Month windows can outlive the 2min session statement_timeout (the July
  // 2026 export's busy months do) — like refreshSearchCaches, this analytics
  // job runs on its own connection with the timeout disabled. The Supabase
  // pooler drops statement_timeout from the startup packet, so it must be an
  // explicit SET — and postgres.js reconnects transparently when the pooler
  // recycles the socket mid-run, losing session GUCs, so the SET is re-issued
  // before every window rather than once.
  const sql = postgres(env.DATABASE_URL, {
    max: 1,
    keep_alive: 30,
    onnotice: () => {},
  });
  try {
    await sql`SET statement_timeout = 0`;
    // The replies self-join times out on the full multi-year range, so we
    // always process month windows and aggregate. Callers can still pass
    // from/to to restrict the overall span.
    const [range] = await sql`
      SELECT min(timestamp)::date AS min_day, max(timestamp)::date AS max_day
      FROM messages WHERE chat_id = ${chatId} AND message_type = 'message'`;
    if (!range?.min_day) return { days: 0, rowsWritten: 0 };
    const iso = (d: unknown) => (d instanceof Date ? d.toISOString() : String(d)).slice(0, 10);
    const overallFrom = opts.from ?? iso(range.min_day);
    const overallTo = opts.to ?? iso(range.max_day);

    // Longevity needs each member's all-time first day — one full scan per
    // RUN, not per window (per-window full scans drowned the free tier's
    // IO budget once the archive hit ~1M rows).
    const firstDays = new Map<string, Date>();
    for (const r of await sql`
      SELECT sender, min(timestamp::date) AS first_day
      FROM messages WHERE chat_id = ${chatId} AND message_type = 'message'
      GROUP BY sender`) {
      firstDays.set(r.sender as string, new Date(r.first_day as string | Date));
    }

    // Month windows are known upfront — lets progress reporting show n/total.
    const windows: Array<{ from: string; to: string }> = [];
    let cursor = new Date(`${overallFrom}T00:00:00Z`);
    const end = new Date(`${overallTo}T00:00:00Z`);
    while (cursor <= end) {
      const nextMonth = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 1));
      const windowEnd = new Date(Math.min(nextMonth.getTime() - 86400000, end.getTime()));
      windows.push({ from: cursor.toISOString().slice(0, 10), to: windowEnd.toISOString().slice(0, 10) });
      cursor = nextMonth;
    }

    let days = 0;
    let rowsWritten = 0;
    let windowsDone = 0;
    opts.onProgress?.({ windowsDone, windowsTotal: windows.length, rowsWritten });
    for (const window of windows) {
      await sql`SET statement_timeout = 0`; // survives a silent reconnect
      const w = await computeWindow(sql, chatId, window.from, window.to, firstDays);
      days += w.days;
      rowsWritten += w.rowsWritten;
      windowsDone += 1;
      opts.onProgress?.({ windowsDone, windowsTotal: windows.length, rowsWritten });
    }
    // Freshness contract: the site reads weekly_stats/member_costars, which
    // depend on member_scores — every scores run ends by refreshing them.
    await refreshFlixViews();
    // Freshness chain: recaps read messages/reactions/sentiments directly —
    // recompute them whenever scores recompute (i.e. after every sentiment
    // run). This tail has no ScoresProgress-shaped signal to report (the
    // caller's progress bar sits at 100% for the ~7min recap pass — a
    // console.log is the cheap visibility until ScoresProgress grows a
    // phase/label field). A recap failure must NOT fail the scores job:
    // scores + weekly_stats/member_costars already committed above, so
    // swallow and log instead of rethrowing.
    console.log(`[computeScores] scores committed (${rowsWritten} rows) — starting recap phase for ${chatId}`);
    try {
      const { computeRecap } = await import('@/lib/recap/compute');
      await computeRecap(chatId);
      console.log(`[computeScores] recap phase complete for ${chatId}`);
    } catch (err) {
      console.error(`[computeScores] recap stage failed (scores committed): ${chatId}`, err);
    }
    return { days, rowsWritten };
  } finally {
    await sql.end();
  }
}

async function computeWindow(
  sql: Sql,
  chatId: string,
  from: string,
  to: string,
  firstDays: Map<string, Date>,
): Promise<{ days: number; rowsWritten: number }> {
  // Everything the formula needs, one row per (member, day). Reply
  // engagement = distinct other-sender messages within 60s after yours
  // (Instagram exports carry no reply threading — same approximation as
  // the search engine's find_interactions RPC).
  const rows = await sql`
    WITH real_messages AS (
      SELECT id, sender, timestamp::date AS day, timestamp, media_type
      FROM messages
      WHERE chat_id = ${chatId} AND message_type = 'message'
        AND timestamp >= ${from}::date
        AND timestamp < (${to}::date + 1)
    ),
    activity AS (
      SELECT sender, day,
        count(*) FILTER (WHERE media_type IS NULL)     AS text_msgs,
        count(*) FILTER (WHERE media_type IS NOT NULL) AS media_msgs
      FROM real_messages GROUP BY sender, day
    ),
    reactions_received AS (
      SELECT rm.sender, rm.day, count(*) AS cnt
      FROM real_messages rm JOIN reactions r ON r.message_id = rm.id
      GROUP BY rm.sender, rm.day
    ),
    replies_received AS (
      -- O(n) reply approximation: a message "replies" to its immediate
      -- predecessor when that predecessor is a different sender within 60s.
      -- (A range self-join was quadratic in busy months and timed out.)
      SELECT prev_sender AS sender, prev_ts::date AS day, count(*) AS cnt
      FROM (
        SELECT sender, timestamp,
               lag(sender)    OVER (ORDER BY timestamp, id) AS prev_sender,
               lag(timestamp) OVER (ORDER BY timestamp, id) AS prev_ts
        FROM real_messages
      ) x
      WHERE prev_sender IS NOT NULL AND prev_sender <> sender
        AND timestamp <= prev_ts + interval '60 seconds'
      GROUP BY prev_sender, prev_ts::date
    ),
    sentiment_received AS (
      -- average per (message, member) pair first: several lanes may have
      -- classified the same pair (ensemble), and confidence-0 rows are
      -- neutral drains, not judgments — they must not pull means to 0.
      -- Window-filtered via real_messages: rows outside the window were
      -- discarded by the final join anyway, but scanning them cost a full
      -- messages pass per window.
      SELECT sender, day, avg(pair_score) AS mean_sentiment FROM (
        SELECT s.member_username AS sender, m.day, s.message_id, avg(s.sentiment_score) AS pair_score
        FROM mention_sentiments s JOIN real_messages m ON m.id = s.message_id
        WHERE s.chat_id = ${chatId} AND s.confidence > 0
        GROUP BY s.member_username, m.day, s.message_id
      ) pairs
      GROUP BY sender, day
    )
    SELECT a.sender, a.day, a.text_msgs::int, a.media_msgs::int,
           COALESCE(rr.cnt, 0)::int AS reactions_received,
           COALESCE(rep.cnt, 0)::int AS replies_received,
           sr.mean_sentiment::float AS mean_sentiment
    FROM activity a
    LEFT JOIN reactions_received rr ON rr.sender = a.sender AND rr.day = a.day
    LEFT JOIN replies_received rep ON rep.sender = a.sender AND rep.day = a.day
    LEFT JOIN sentiment_received sr ON sr.sender = a.sender AND sr.day = a.day
    ORDER BY a.day, a.sender`;

  const toDate = (d: unknown) => (d instanceof Date ? d : new Date(String(d)));
  const scoreRows = rows.map(r => {
    const day = toDate(r.day);
    const first = firstDays.get(r.sender as string) ?? day;
    const components = {
      activity: activityComponent(
        (r.text_msgs as number) * messageWeight('message', null) +
        (r.media_msgs as number) * messageWeight('message', 'photo')),
      sentiment: sentimentComponent(r.mean_sentiment as number | null),
      reaction: reactionComponent(r.reactions_received as number),
      engagement: engagementComponent(r.replies_received as number),
      longevity: longevityComponent(Math.round((day.getTime() - first.getTime()) / 86400000)),
    };
    return {
      chat_id: chatId,
      member_username: r.sender as string,
      date: r.day as Date,
      score: composeScore(components),
      activity_component: components.activity,
      sentiment_component: components.sentiment,
      reaction_component: components.reaction,
      engagement_component: components.engagement,
      longevity_component: components.longevity,
      scoring_version: SCORING_VERSION,
    };
  });

  for (const batch of chunk(scoreRows, 1000)) {
    await sql`
      INSERT INTO member_scores ${sql(batch, 'chat_id', 'member_username', 'date', 'score', 'activity_component', 'sentiment_component', 'reaction_component', 'engagement_component', 'longevity_component', 'scoring_version')}
      ON CONFLICT (chat_id, member_username, date) DO UPDATE SET
        score = EXCLUDED.score,
        activity_component = EXCLUDED.activity_component,
        sentiment_component = EXCLUDED.sentiment_component,
        reaction_component = EXCLUDED.reaction_component,
        engagement_component = EXCLUDED.engagement_component,
        longevity_component = EXCLUDED.longevity_component,
        scoring_version = EXCLUDED.scoring_version,
        computed_at = now()`;
  }

  const days = new Set(rows.map(r => String(r.day))).size;
  return { days, rowsWritten: scoreRows.length };
}
