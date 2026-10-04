-- 113: ensemble-safe weekly stats.
--
-- The original weekly_stats view aggregates mention_sentiments rows directly.
-- Once multiple models classify the same (message, member) pair, that makes a
-- single mention count multiple times and weights it more heavily than pairs
-- with fewer cached models. Keep 106 intact and add a corrected view that
-- derives the sentiment columns once per pair.

SET LOCAL statement_timeout = 0;

CREATE MATERIALIZED VIEW weekly_stats_v2 AS
WITH anchor AS (
  SELECT DISTINCT chat_id, week_end FROM weekly_stats
),
pair_sentiments AS (
  SELECT s.chat_id, s.member_username, s.message_id,
         avg(s.sentiment_score)::float AS pair_score
  FROM mention_sentiments s
  JOIN messages m ON m.id = s.message_id
  JOIN anchor a ON a.chat_id = s.chat_id
  WHERE s.confidence > 0
    AND m.timestamp >= a.week_end - 6
    AND m.timestamp < a.week_end + 1
  GROUP BY s.chat_id, s.member_username, s.message_id
),
ment AS (
  SELECT chat_id, member_username,
         count(*)::int                 AS mentions_7d,
         avg(pair_score)::float        AS mention_sentiment_mean,
         stddev_samp(pair_score)::float AS mention_sentiment_stddev
  FROM pair_sentiments
  GROUP BY chat_id, member_username
)
SELECT w.chat_id, w.member_username, w.week_end,
       w.first_message_at, w.last_active_at, w.messages_all_time,
       w.messages_7d, w.messages_prev7, w.reactions_7d,
       w.weekly_score, w.prev_score,
       COALESCE(m.mentions_7d, 0) AS mentions_7d,
       m.mention_sentiment_mean,
       m.mention_sentiment_stddev
FROM weekly_stats w
LEFT JOIN ment m
  ON m.chat_id = w.chat_id AND m.member_username = w.member_username;

CREATE UNIQUE INDEX idx_weekly_stats_v2_pk
  ON weekly_stats_v2 (chat_id, member_username);
