import { sql } from '@/lib/db/client';
import { FLIX_CHAT } from './config';
import { resolveShowArt, type ArtSpec, type ShowArt } from './art';
import { mediaUrl } from './format';
import { clampFrame, type Frame } from './frame';
import type { WeeklyStat } from './categories';

/** The "Instagram User" pseudo-member collects deactivated accounts — never a show. */
const PSEUDO = 'Instagram User';

export type ProfilePick = {
  username: string;
  displayName: string;
  tileUrl: string | null;
  avatarUrl: string | null;
};

export function profilePickFromRow(r: Record<string, unknown>): ProfilePick {
  return {
    username: r.username as string,
    displayName: r.display_name as string,
    tileUrl: (r.tile_url as string | null) ?? null,
    avatarUrl: (r.avatar_url as string | null) ?? null,
  };
}

/** The "Who's watching?" grid: the most active members THIS WEEK (weekly_stats
 *  matview, tie-broken by all-time count), with their curated tile/pfp art.
 *  Members hidden in the Shows editor never appear here — the login screen
 *  counts as featuring. Cosmetic: callers must never block login on it. */
export async function getProfilePickList(limit = 8, chatId = FLIX_CHAT): Promise<ProfilePick[]> {
  const rows = await sql`
    SELECT m.username, COALESCE(m.alias, m.username) AS display_name,
           p.tile_url, p.avatar_url
    FROM weekly_stats_v2 w
    JOIN members m ON m.username = w.member_username AND m.chat_id = w.chat_id
    LEFT JOIN resolved_member_profiles p ON p.chat_id = w.chat_id AND p.member_username = w.member_username
    WHERE w.chat_id = ${chatId}
      AND m.status <> 'removed' AND m.username <> ${PSEUDO}
      AND COALESCE(p.hidden, FALSE) = FALSE
    ORDER BY w.messages_7d DESC, w.messages_all_time DESC
    LIMIT ${limit}`;
  return rows.map(profilePickFromRow);
}

/** One selected viewer's resolved square tile/pfp for the persistent nav.
 * Fetching one profile avoids embedding every large inline tile in each page. */
export async function getProfilePick(username: string, chatId = FLIX_CHAT): Promise<ProfilePick | null> {
  const [row] = await sql`
    SELECT m.username, COALESCE(m.alias, m.username) AS display_name,
           p.tile_url, p.avatar_url
    FROM members m
    LEFT JOIN resolved_member_profiles p ON p.chat_id = m.chat_id AND p.member_username = m.username
    WHERE m.chat_id = ${chatId} AND m.username = ${username}
      AND m.status <> 'removed' AND m.username <> ${PSEUDO}
      AND COALESCE(p.hidden, FALSE) = FALSE
    LIMIT 1`;
  return row ? profilePickFromRow(row) : null;
}

/** username → pfp for everyone who has one uploaded (small: curated members
 *  only). Provided page-wide so chat surfaces can resolve pfps by sender. */
export async function getAvatarMap(chatId = FLIX_CHAT): Promise<Record<string, string>> {
  const rows = await sql`
    SELECT member_username, avatar_url FROM resolved_member_profiles
    WHERE chat_id = ${chatId} AND avatar_url IS NOT NULL`;
  return Object.fromEntries(rows.map(r => [r.member_username as string, r.avatar_url as string]));
}

export type MemberSearchCard = {
  username: string;
  displayName: string;
  preset: string | null;
  art: ArtSpec;
};

/** Escape ILIKE wildcards so user input matches literally. */
export function escapeLike(q: string): string {
  return q.replace(/[\\%_]/g, m => `\\${m}`);
}

/** Shape a member row (username/display/preset + card-art columns) into the
 *  poster-card payload used by search. Exported for unit tests. */
export function memberSearchCardFromRow(r: Record<string, unknown>): MemberSearchCard {
  return {
    username: r.member_username as string,
    displayName: r.display_name as string,
    preset: (r.banner_preset as string | null) ?? null,
    art: resolveShowArt({
      banner_url: mediaUrl(r.banner_url as string | null),
      card_url: mediaUrl(r.card_url as string | null),
      card_fit: (r.card_fit as string | null) ?? null,
      card_frame: mapFrame(r, 'poster'),
    }).card,
  };
}

const MEMBER_CARD_COLS = sql`
  w.member_username, COALESCE(mem.alias, w.member_username) AS display_name,
  p.banner_preset, p.banner_url, p.card_url, p.card_fit,
  p.poster_focus_x, p.poster_focus_y, p.poster_zoom`;

/** Netflix-style member search: case-insensitive substring match on username,
 *  display name, and every nickname alias; prefix matches rank first, then
 *  all-time message count. Anchored on weekly_stats (≥1 real message). */
export async function searchMembers(q: string, limit = 24, chatId = FLIX_CHAT): Promise<MemberSearchCard[]> {
  const sub = `%${escapeLike(q)}%`;
  const pre = `${escapeLike(q)}%`;
  const rows = await sql`
    SELECT ${MEMBER_CARD_COLS}, w.messages_all_time,
           (w.member_username ILIKE ${pre}
            OR COALESCE(mem.alias, '') ILIKE ${pre}
            OR EXISTS (SELECT 1 FROM member_aliases a
                       WHERE a.chat_id = w.chat_id AND a.member_username = w.member_username
                         AND a.alias ILIKE ${pre})) AS prefix_match
    FROM weekly_stats_v2 w
    JOIN members mem ON mem.username = w.member_username AND mem.chat_id = w.chat_id
    LEFT JOIN resolved_member_profiles p ON p.chat_id = w.chat_id AND p.member_username = w.member_username
    WHERE w.chat_id = ${chatId}
      AND mem.status <> 'removed' AND w.member_username <> ${PSEUDO}
      AND COALESCE(p.hidden, FALSE) = FALSE
      AND (w.member_username ILIKE ${sub}
           OR COALESCE(mem.alias, '') ILIKE ${sub}
           OR EXISTS (SELECT 1 FROM member_aliases a
                      WHERE a.chat_id = w.chat_id AND a.member_username = w.member_username
                        AND a.alias ILIKE ${sub}))
    ORDER BY prefix_match DESC, w.messages_all_time DESC
    LIMIT ${limit}`;
  return rows.map(memberSearchCardFromRow);
}

/** "Top searches" pre-typing grid: Who's-Watching ranking (this week's
 *  messages, all-time tiebreak) as show cards. */
export async function getTopSearchMembers(limit = 18, chatId = FLIX_CHAT): Promise<MemberSearchCard[]> {
  const rows = await sql`
    SELECT ${MEMBER_CARD_COLS}
    FROM weekly_stats_v2 w
    JOIN members mem ON mem.username = w.member_username AND mem.chat_id = w.chat_id
    LEFT JOIN resolved_member_profiles p ON p.chat_id = w.chat_id AND p.member_username = w.member_username
    WHERE w.chat_id = ${chatId}
      AND mem.status <> 'removed' AND w.member_username <> ${PSEUDO}
      AND COALESCE(p.hidden, FALSE) = FALSE
    ORDER BY w.messages_7d DESC, w.messages_all_time DESC
    LIMIT ${limit}`;
  return rows.map(memberSearchCardFromRow);
}

/** All members' weekly numbers joined with their curated profile. One matview
 *  read — no live aggregation. Powers every home category + the market. */
export async function getWeeklyStats(chatId = FLIX_CHAT): Promise<WeeklyStat[]> {
  const rows = await sql`
    SELECT w.member_username,
           COALESCE(mem.alias, w.member_username) AS display_name,
           w.week_end::text AS week_end,
           w.first_message_at, w.last_active_at,
           w.messages_all_time, w.messages_7d, w.messages_prev7, w.reactions_7d,
           w.weekly_score, w.prev_score, w.mentions_7d,
           w.mention_sentiment_mean, w.mention_sentiment_stddev,
           COALESCE(p.hidden, FALSE) AS hidden,
           p.avatar_url, p.banner_url, p.banner_preset,
           p.banner_focus_x, p.banner_focus_y, p.banner_zoom,
           p.poster_focus_x, p.poster_focus_y, p.poster_zoom,
           p.card_url, p.hero_desktop_url, p.hero_mobile_url,
           p.card_fit, p.hero_desktop_fit, p.hero_mobile_fit,
           p.hero_mobile_focus_x, p.hero_mobile_focus_y, p.hero_mobile_zoom
    FROM weekly_stats_v2 w
    JOIN members mem ON mem.username = w.member_username AND mem.chat_id = w.chat_id
    LEFT JOIN resolved_member_profiles p ON p.chat_id = w.chat_id AND p.member_username = w.member_username
    WHERE w.chat_id = ${chatId}
      AND mem.status <> 'removed'
      AND w.member_username <> ${PSEUDO}`;
  return rows.map(mapWeekly);
}

function mapWeekly(r: Record<string, unknown>): WeeklyStat {
  return {
    member_username: r.member_username as string,
    display_name: r.display_name as string,
    week_end: r.week_end as string,
    first_message_at: (r.first_message_at as Date).toISOString(),
    last_active_at: (r.last_active_at as Date).toISOString(),
    messages_all_time: Number(r.messages_all_time),
    messages_7d: Number(r.messages_7d),
    messages_prev7: Number(r.messages_prev7),
    reactions_7d: Number(r.reactions_7d),
    weekly_score: Number(r.weekly_score),
    prev_score: Number(r.prev_score),
    mentions_7d: Number(r.mentions_7d),
    mention_sentiment_mean: r.mention_sentiment_mean == null ? null : Number(r.mention_sentiment_mean),
    mention_sentiment_stddev: r.mention_sentiment_stddev == null ? null : Number(r.mention_sentiment_stddev),
    hidden: Boolean(r.hidden),
    avatar_url: (r.avatar_url as string | null) ?? null,
    banner_url: (r.banner_url as string | null) ?? null,
    banner_preset: (r.banner_preset as string | null) ?? null,
    banner_frame: mapFrame(r),
    poster_frame: mapFrame(r, 'poster'),
    show_art: mapShowArt(r),
  };
}

/** Build a Frame from a row's <kind>_focus_x/y + <kind>_zoom columns (null
 *  for members with no profile row — renders as the default frame). */
function mapFrame(r: Record<string, unknown>, kind: 'banner' | 'poster' | 'hero_mobile' = 'banner'): Frame | null {
  if (r[`${kind}_focus_x`] == null) return null;
  return clampFrame({
    x: Number(r[`${kind}_focus_x`]),
    y: Number(r[`${kind}_focus_y`]),
    zoom: Number(r[`${kind}_zoom`]),
  });
}

/** Resolve a profile row's per-target artwork (card / desktop hero / mobile
 *  hero) with the banner as the fallback image, urls media-resolved. */
function mapShowArt(r: Record<string, unknown>): ShowArt {
  return resolveShowArt({
    banner_url: mediaUrl(r.banner_url as string | null),
    card_url: mediaUrl(r.card_url as string | null),
    hero_desktop_url: mediaUrl(r.hero_desktop_url as string | null),
    hero_mobile_url: mediaUrl(r.hero_mobile_url as string | null),
    card_fit: (r.card_fit as string | null) ?? null,
    hero_desktop_fit: (r.hero_desktop_fit as string | null) ?? null,
    hero_mobile_fit: (r.hero_mobile_fit as string | null) ?? null,
    card_frame: mapFrame(r, 'poster'),
    hero_desktop_frame: mapFrame(r),
    hero_mobile_frame: mapFrame(r, 'hero_mobile'),
  });
}

export type ScorePoint = { date: string; score: number };
export type ScoreSeries = { username: string; points: ScorePoint[] };

/** Daily score series for the given members over the trailing `days`. */
export async function getScoreSeries(usernames: string[], days: number, chatId = FLIX_CHAT): Promise<ScoreSeries[]> {
  if (usernames.length === 0) return [];
  const rows = await sql`
    WITH anchor AS (SELECT max(date) AS week_end FROM member_scores WHERE chat_id = ${chatId})
    SELECT member_username, date::text AS date, score
    FROM member_scores, anchor
    WHERE chat_id = ${chatId}
      AND member_username = ANY(${usernames})
      AND date > anchor.week_end - ${days}::int
    ORDER BY member_username, date`;
  const byUser = new Map<string, ScorePoint[]>();
  for (const r of rows) {
    const u = r.member_username as string;
    if (!byUser.has(u)) byUser.set(u, []);
    byUser.get(u)!.push({ date: r.date as string, score: Number(r.score) });
  }
  return usernames.filter(u => byUser.has(u)).map(u => ({ username: u, points: byUser.get(u)! }));
}

/** Full score history for one member (for the solo show-page chart). */
export async function getMemberScoreSeries(username: string, chatId = FLIX_CHAT): Promise<ScorePoint[]> {
  const rows = await sql`
    SELECT date::text AS date, score FROM member_scores
    WHERE chat_id = ${chatId} AND member_username = ${username}
    ORDER BY date`;
  return rows.map(r => ({ date: r.date as string, score: Number(r.score) }));
}

export type MemberHeader = {
  username: string;
  displayName: string;
  firstMessageAt: string;
  lastActiveAt: string;
  messagesAllTime: number;
  weeklyScore: number;
  scorePercentile: number; // 0..1 among active members this week
  tagline: string | null;
  description: string | null;
  avatarUrl: string | null;
  bannerPreset: string | null;
  art: ShowArt;
  aliases: string[];
};

export async function getMemberHeader(username: string, chatId = FLIX_CHAT): Promise<MemberHeader | null> {
  const [row] = await sql`
    WITH ranked AS (
      SELECT member_username,
             percent_rank() OVER (ORDER BY weekly_score) AS pct
      FROM weekly_stats_v2 WHERE chat_id = ${chatId} AND messages_7d > 0
    )
    SELECT w.member_username,
           COALESCE(mem.alias, w.member_username) AS display_name,
           w.first_message_at, w.last_active_at, w.messages_all_time, w.weekly_score,
           COALESCE(r.pct, 0) AS pct,
           p.tagline, p.description, p.avatar_url, p.banner_url, p.banner_preset,
           p.banner_focus_x, p.banner_focus_y, p.banner_zoom,
           p.card_url, p.hero_desktop_url, p.hero_mobile_url,
           p.card_fit, p.hero_desktop_fit, p.hero_mobile_fit,
           p.hero_mobile_focus_x, p.hero_mobile_focus_y, p.hero_mobile_zoom,
           (SELECT COALESCE(array_agg(a.alias ORDER BY a.alias), ARRAY[]::text[])
              FROM (SELECT alias FROM member_aliases
                    WHERE chat_id = ${chatId} AND member_username = ${username}
                      AND alias_type <> 'handle'
                    ORDER BY alias LIMIT 6) a) AS aliases
    FROM weekly_stats_v2 w
    JOIN members mem ON mem.username = w.member_username AND mem.chat_id = w.chat_id
    LEFT JOIN resolved_member_profiles p ON p.chat_id = w.chat_id AND p.member_username = w.member_username
    LEFT JOIN ranked r ON r.member_username = w.member_username
    WHERE w.chat_id = ${chatId} AND w.member_username = ${username} AND mem.status <> 'removed'`;
  if (!row) return null;
  return {
    username: row.member_username as string,
    displayName: row.display_name as string,
    firstMessageAt: (row.first_message_at as Date).toISOString(),
    lastActiveAt: (row.last_active_at as Date).toISOString(),
    messagesAllTime: Number(row.messages_all_time),
    weeklyScore: Number(row.weekly_score),
    scorePercentile: Number(row.pct),
    tagline: (row.tagline as string | null) ?? null,
    description: (row.description as string | null) ?? null,
    avatarUrl: (row.avatar_url as string | null) ?? null,
    bannerPreset: (row.banner_preset as string | null) ?? null,
    art: mapShowArt(row),
    aliases: ((row.aliases as string[] | null) ?? []),
  };
}

export type Episode = {
  id: string;
  sender: string;
  sentAt: string;
  content: string;
  mediaType: string | null;
  reactionCount: number;
};

function mapEpisode(r: Record<string, unknown>): Episode {
  return {
    id: r.id as string,
    sender: r.sender as string,
    sentAt: (r.timestamp as Date).toISOString(),
    content: r.content as string,
    mediaType: (r.media_type as string | null) ?? null,
    reactionCount: Number(r.reaction_count ?? 0),
  };
}

/** Top-reacted messages all-time — reads the reaction-count matview. */
export async function getGreatestHits(username: string, limit = 12, chatId = FLIX_CHAT): Promise<Episode[]> {
  const rows = await sql`
    SELECT m.id, m.sender, m.timestamp, m.content, m.media_type, c.rxn_count AS reaction_count
    FROM message_reaction_counts c
    JOIN messages m ON m.id = c.message_id
    WHERE m.chat_id = ${chatId} AND m.sender = ${username} AND m.message_type = 'message'
    ORDER BY c.rxn_count DESC, m.timestamp DESC
    LIMIT ${limit}`;
  return rows.map(mapEpisode);
}

export async function getRecentEpisodes(username: string, limit = 12, chatId = FLIX_CHAT): Promise<Episode[]> {
  const rows = await sql`
    SELECT m.id, m.sender, m.timestamp, m.content, m.media_type,
           (SELECT count(*)::int FROM reactions WHERE message_id = m.id) AS reaction_count
    FROM messages m
    WHERE m.chat_id = ${chatId} AND m.sender = ${username}
      AND m.message_type = 'message' AND m.content <> ''
    ORDER BY m.timestamp DESC
    LIMIT ${limit}`;
  return rows.map(mapEpisode);
}

export type Costar = { username: string; displayName: string; interactions: number; art: ArtSpec };

export async function getCostars(username: string, limit = 12, chatId = FLIX_CHAT): Promise<Costar[]> {
  const rows = await sql`
    SELECT other AS username, COALESCE(mem.alias, other) AS display_name, interactions,
           p.banner_url, p.card_url, p.card_fit,
           p.poster_focus_x, p.poster_focus_y, p.poster_zoom
    FROM (
      SELECT member_b AS other, interactions FROM member_costars
        WHERE chat_id = ${chatId} AND member_a = ${username}
      UNION ALL
      SELECT member_a AS other, interactions FROM member_costars
        WHERE chat_id = ${chatId} AND member_b = ${username}
    ) x
    JOIN members mem ON mem.username = x.other AND mem.chat_id = ${chatId}
    LEFT JOIN resolved_member_profiles p ON p.member_username = x.other AND p.chat_id = ${chatId}
    WHERE mem.status <> 'removed' AND x.other <> ${PSEUDO}
    ORDER BY interactions DESC
    LIMIT ${limit}`;
  return rows.map(r => ({
    username: r.username as string,
    displayName: r.display_name as string,
    interactions: Number(r.interactions),
    art: resolveShowArt({
      banner_url: mediaUrl(r.banner_url as string | null),
      card_url: mediaUrl(r.card_url as string | null),
      card_fit: (r.card_fit as string | null) ?? null,
      card_frame: mapFrame(r, 'poster'),
    }).card,
  }));
}

export type CustomEntry = {
  id: string;
  title: string;
  subtitle: string | null;
  posterUrl: string | null;
  posterPreset: string | null;
  memberUsername: string | null;
};
export type CustomRow = { id: string; title: string; entries: CustomEntry[] };

/** Admin-curated home rows (enabled only), in position order. */
export async function getCustomRows(chatId = FLIX_CHAT): Promise<CustomRow[]> {
  const rows = await sql`
    SELECT c.id AS cat_id, c.title AS cat_title, c.position AS cat_pos,
           e.id AS entry_id, e.title, e.subtitle, e.poster_url, e.poster_preset,
           e.member_username, e.position AS entry_pos
    FROM custom_categories c
    LEFT JOIN custom_category_entries e ON e.category_id = c.id
    WHERE c.chat_id = ${chatId} AND c.enabled = TRUE
    ORDER BY c.position, c.id, e.position, e.id`;
  const byCat = new Map<string, CustomRow>();
  for (const r of rows) {
    const catId = String(r.cat_id);
    if (!byCat.has(catId)) byCat.set(catId, { id: catId, title: r.cat_title as string, entries: [] });
    if (r.entry_id != null) {
      byCat.get(catId)!.entries.push({
        id: String(r.entry_id),
        title: r.title as string,
        subtitle: (r.subtitle as string | null) ?? null,
        posterUrl: (r.poster_url as string | null) ?? null,
        posterPreset: (r.poster_preset as string | null) ?? null,
        memberUsername: (r.member_username as string | null) ?? null,
      });
    }
  }
  return [...byCat.values()].filter(row => row.entries.length > 0);
}

export type Billboard = {
  username: string;
  displayName: string;
  tagline: string | null;
  description: string | null;
  bannerPreset: string | null;
  art: ShowArt;
  messagesAllTime: number;
};

/** The featured show: an admin-pinned member, else this week's #1 by score. */
export async function getBillboardPick(stats: WeeklyStat[], chatId = FLIX_CHAT): Promise<Billboard | null> {
  const [pinned] = await sql`
    SELECT p.member_username, COALESCE(mem.alias, p.member_username) AS display_name,
           p.tagline, p.description, p.banner_url, p.banner_preset,
           p.banner_focus_x, p.banner_focus_y, p.banner_zoom,
           p.card_url, p.hero_desktop_url, p.hero_mobile_url,
           p.card_fit, p.hero_desktop_fit, p.hero_mobile_fit,
           p.hero_mobile_focus_x, p.hero_mobile_focus_y, p.hero_mobile_zoom
    FROM resolved_member_profiles p
    JOIN members mem ON mem.username = p.member_username AND mem.chat_id = p.chat_id
    WHERE p.chat_id = ${chatId} AND p.pinned = TRUE
    LIMIT 1`;
  if (pinned) {
    const stat = stats.find(s => s.member_username === pinned.member_username);
    return {
      username: pinned.member_username as string,
      displayName: pinned.display_name as string,
      tagline: (pinned.tagline as string | null) ?? null,
      description: (pinned.description as string | null) ?? null,
      bannerPreset: (pinned.banner_preset as string | null) ?? null,
      art: mapShowArt(pinned),
      messagesAllTime: stat?.messages_all_time ?? 0,
    };
  }
  const top = [...stats].filter(s => !s.hidden).sort((a, b) => b.weekly_score - a.weekly_score)[0];
  if (!top) return null;
  return {
    username: top.member_username,
    displayName: top.display_name,
    tagline: null,
    description: null,
    bannerPreset: top.banner_preset,
    art: top.show_art ?? resolveShowArt({ banner_url: mediaUrl(top.banner_url) }),
    messagesAllTime: top.messages_all_time,
  };
}
