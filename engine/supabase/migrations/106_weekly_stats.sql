-- 106: weekly_stats — one precomputed row per (chat, sender) powering the
-- FLIX home page (Top 10 / Trending / categories / market watchlist).
-- Anchored at the chat's newest message day so a stale archive still has a
-- meaningful "this week". Refreshed by refreshFlixViews() at the end of
-- every scores compute and ingest.

-- Both matview builds scan the full messages table; the pooler's 2min
-- session default would kill them on a slow-IO day. SET LOCAL scopes the
-- override to this migration's transaction.
SET LOCAL statement_timeout = 0;

CREATE MATERIALIZED VIEW weekly_stats AS
WITH anchor AS (
  SELECT chat_id, max(timestamp)::date AS week_end
  FROM messages WHERE message_type = 'message' GROUP BY chat_id
),
firsts AS (
  SELECT chat_id, sender,
         min(timestamp) AS first_message_at,
         max(timestamp) AS last_active_at,
         count(*)       AS messages_all_time
  FROM messages WHERE message_type = 'message'
  GROUP BY chat_id, sender
),
recent AS (  -- one 14-day scan serves both message windows
  SELECT m.chat_id, m.sender,
         count(*) FILTER (WHERE m.timestamp >= a.week_end - 6)::int AS messages_7d,
         count(*) FILTER (WHERE m.timestamp <  a.week_end - 6)::int AS messages_prev7
  FROM messages m
  JOIN anchor a ON a.chat_id = m.chat_id
  WHERE m.message_type = 'message'
    AND m.timestamp >= a.week_end - 13
    AND m.timestamp < a.week_end + 1
  GROUP BY m.chat_id, m.sender
),
rx AS (
  SELECT m.chat_id, m.sender, count(*)::int AS reactions_7d
  FROM messages m
  JOIN anchor a ON a.chat_id = m.chat_id
  JOIN reactions r ON r.message_id = m.id
  WHERE m.message_type = 'message'
    AND m.timestamp >= a.week_end - 6 AND m.timestamp < a.week_end + 1
  GROUP BY m.chat_id, m.sender
),
scores_cur AS (
  SELECT s.chat_id, s.member_username, sum(s.score)::float AS weekly_score
  FROM member_scores s JOIN anchor a ON a.chat_id = s.chat_id
  WHERE s.date > a.week_end - 7 AND s.date <= a.week_end
  GROUP BY s.chat_id, s.member_username
),
scores_prev AS (
  SELECT s.chat_id, s.member_username, sum(s.score)::float AS prev_score
  FROM member_scores s JOIN anchor a ON a.chat_id = s.chat_id
  WHERE s.date > a.week_end - 14 AND s.date <= a.week_end - 7
  GROUP BY s.chat_id, s.member_username
),
ment AS (
  SELECT s.chat_id, s.member_username,
         count(*)::int                          AS mentions_7d,
         avg(s.sentiment_score)::float          AS mention_sentiment_mean,
         stddev_samp(s.sentiment_score)::float  AS mention_sentiment_stddev
  FROM mention_sentiments s
  JOIN messages m ON m.id = s.message_id
  JOIN anchor a ON a.chat_id = s.chat_id
  WHERE s.confidence > 0
    AND m.timestamp >= a.week_end - 6 AND m.timestamp < a.week_end + 1
  GROUP BY s.chat_id, s.member_username
)
SELECT f.chat_id, f.sender AS member_username,
       a.week_end,
       f.first_message_at, f.last_active_at, f.messages_all_time::int,
       COALESCE(r.messages_7d, 0)    AS messages_7d,
       COALESCE(r.messages_prev7, 0) AS messages_prev7,
       COALESCE(x.reactions_7d, 0)   AS reactions_7d,
       COALESCE(sc.weekly_score, 0)  AS weekly_score,
       COALESCE(sp.prev_score, 0)    AS prev_score,
       COALESCE(mt.mentions_7d, 0)   AS mentions_7d,
       mt.mention_sentiment_mean,
       mt.mention_sentiment_stddev
FROM firsts f
JOIN anchor a  ON a.chat_id = f.chat_id
LEFT JOIN recent r       ON r.chat_id = f.chat_id AND r.sender = f.sender
LEFT JOIN rx x           ON x.chat_id = f.chat_id AND x.sender = f.sender
LEFT JOIN scores_cur sc  ON sc.chat_id = f.chat_id AND sc.member_username = f.sender
LEFT JOIN scores_prev sp ON sp.chat_id = f.chat_id AND sp.member_username = f.sender
LEFT JOIN ment mt        ON mt.chat_id = f.chat_id AND mt.member_username = f.sender;

CREATE UNIQUE INDEX idx_weekly_stats_pk ON weekly_stats (chat_id, member_username);

-- member_costars: all-time adjacent-message interaction pairs (same O(n)
-- lag approximation as scoring). Powers "Frequent co-stars" on show pages.
CREATE MATERIALIZED VIEW member_costars AS
WITH seq AS (
  SELECT chat_id, sender, timestamp,
         lag(sender)    OVER (PARTITION BY chat_id ORDER BY timestamp, id) AS prev_sender,
         lag(timestamp) OVER (PARTITION BY chat_id ORDER BY timestamp, id) AS prev_ts
  FROM messages WHERE message_type = 'message'
)
SELECT chat_id,
       least(sender, prev_sender)    AS member_a,
       greatest(sender, prev_sender) AS member_b,
       count(*)::int AS interactions
FROM seq
WHERE prev_sender IS NOT NULL AND prev_sender <> sender
  AND timestamp <= prev_ts + interval '60 seconds'
GROUP BY 1, 2, 3;

CREATE UNIQUE INDEX idx_member_costars_pk ON member_costars (chat_id, member_a, member_b);
CREATE INDEX idx_member_costars_b ON member_costars (chat_id, member_b);
