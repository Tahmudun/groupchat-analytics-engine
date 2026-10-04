import { sql } from '@/lib/db/client';
import { FLIX_CHAT } from '@/lib/flix/config';
import { buildUniverseGraph } from './graph';
import type { UniverseGraph, UniverseSourceEdge, UniverseSourceNode } from './types';

const PSEUDO = 'Instagram User';

/** Reads only existing precomputed views plus the small score table. No raw
 * message/reaction scan is allowed on this request path. */
export async function getUniverseGraph(chatId = FLIX_CHAT): Promise<UniverseGraph> {
  const nodeRows = await sql`
    SELECT w.member_username, COALESCE(m.alias, w.member_username) AS display_name,
           w.messages_all_time, w.messages_7d, w.reactions_7d, w.weekly_score,
           w.first_message_at, w.last_active_at
    FROM weekly_stats_v2 w
    JOIN members m ON m.chat_id = w.chat_id AND m.username = w.member_username
    LEFT JOIN member_profiles p ON p.chat_id = w.chat_id AND p.member_username = w.member_username
    WHERE w.chat_id = ${chatId} AND m.status <> 'removed'
      AND w.member_username <> ${PSEUDO} AND COALESCE(p.hidden, FALSE) = FALSE
      AND w.messages_all_time > 0
    ORDER BY w.messages_all_time DESC
    LIMIT 900`;
  const usernames = nodeRows.map(row => row.member_username as string);
  if (usernames.length === 0) return buildUniverseGraph([], [], []);

  const [edgeRows, scoreRows] = await Promise.all([
    sql`
      WITH ranked AS (
        SELECT c.member_a, c.member_b, c.interactions,
               row_number() OVER (PARTITION BY c.member_a ORDER BY c.interactions DESC, c.member_b) AS rank_a,
               row_number() OVER (PARTITION BY c.member_b ORDER BY c.interactions DESC, c.member_a) AS rank_b
        FROM member_costars c
        WHERE c.chat_id = ${chatId}
          AND c.member_a = ANY(${usernames}) AND c.member_b = ANY(${usernames})
      )
      SELECT member_a, member_b, interactions FROM ranked
      WHERE rank_a <= 7 OR rank_b <= 7
      ORDER BY interactions DESC
      LIMIT 4000`,
    sql`
      SELECT member_username, date_trunc('month', date)::date::text AS month,
             avg(score)::float AS score
      FROM member_scores
      WHERE chat_id = ${chatId} AND member_username = ANY(${usernames})
      GROUP BY member_username, date_trunc('month', date)
      ORDER BY month, member_username`,
  ]);

  const timeline = [...new Set(scoreRows.map(row => String(row.month).slice(0, 7)))].sort();
  const monthIndex = new Map(timeline.map((month, index) => [month, index]));
  const history = new Map<string, number[]>();
  for (const username of usernames) history.set(username, timeline.map(() => 0));
  for (const row of scoreRows) {
    const index = monthIndex.get(String(row.month).slice(0, 7));
    if (index != null) history.get(row.member_username as string)![index] = Math.max(0, Number(row.score) || 0);
  }

  const nodes: UniverseSourceNode[] = nodeRows.map(row => ({
    id: row.member_username as string,
    name: row.display_name as string,
    messages: Math.max(0, Number(row.messages_all_time) || 0),
    recentMessages: Math.max(0, Number(row.messages_7d) || 0),
    reactions: Math.max(0, Number(row.reactions_7d) || 0),
    weeklyScore: Math.max(0, Number(row.weekly_score) || 0),
    firstActive: (row.first_message_at as Date).toISOString(),
    lastActive: (row.last_active_at as Date).toISOString(),
    history: history.get(row.member_username as string) ?? timeline.map(() => 0),
  }));
  const edges: UniverseSourceEdge[] = edgeRows.map(row => ({
    a: row.member_a as string,
    b: row.member_b as string,
    interactions: Math.max(0, Number(row.interactions) || 0),
  }));
  return buildUniverseGraph(nodes, edges, timeline);
}
