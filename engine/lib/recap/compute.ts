import postgres from 'postgres';
import { env } from '@/lib/env';
import { longestStreak, longestGap } from './records';
import { TextTally, tokenize, type MemberTextStats } from './text';
import { topCatchphrases } from './catchphrase';
import { percentileMap, classifyPersona, type PersonaInputs } from './persona';
import { STATS_VERSION, type RecapStats, type NameCount } from './types';

type Sql = ReturnType<typeof postgres>;

export type RecapProgress = { done: number; total: number | null; label: string };

export type DayCount = { date: string; count: number };
export type WeekMean = { weekStart: string; mean: number };
export type SentimentPair = { name: string; score: number; count: number };

/** Per-member working set, folded in JS from a handful of GROUP BY queries
 *  over the whole chat (never one query per member — see compute() below).
 *  This is also the pure-assembly input consumed by buildMemberStats, so its
 *  shape is part of the tested contract (see compute.test.ts). */
export type MemberAggregates = {
  member: string;
  totalChatMessages: number;
  days: DayCount[];
  hours: Map<number, number>;
  binge: { hourStart: string; count: number } | null;
  reactionsGiven: number;
  reactionsReceived: number;
  emojiGiven: NameCount[];
  emojiReceived: NameCount[];
  fansIn: NameCount[];   // reactor -> count, this member is the target
  fansOut: NameCount[];  // target -> count, this member is the reactor
  mentions: number;
  mentionDays: DayCount[];
  approvalMean: number | null;
  approvalTrend: WeekMean[]; // raw -1..1 means, already trimmed to last 8 weeks
  sentimentGivenMean: number | null; // ungated mean of this member's authored sentiment
                                      // (persona input; pairsOut below is HAVING >= 10
                                      // gated and only for supporter/nemesis superlatives)
  pairsIn: SentimentPair[];  // others' sentiment toward this member (author != member)
  pairsOut: SentimentPair[]; // this member's sentiment toward others (target != member)
  monologue: { messageId: string; date: string; content: string } | null;
  text: MemberTextStats;
  globalTokens: Map<string, number>;
  globalWords: number;
  rank: number;
  membersRanked: number;
  profanityRank: number | null;
};

const EMPTY_TEXT: MemberTextStats = { tokens: new Map(), words: 0, messages: 0, laughs: 0, caps: 0, profanity: 0 };

/** 0-5 "3am poster", 6-11 "morning show", 12-17 "daytime TV", 18-23 "primetime". */
export function clockTag(hour: number): string {
  if (hour < 6) return '3am poster';
  if (hour < 12) return 'morning show';
  if (hour < 18) return 'daytime TV';
  return 'primetime';
}

function maxNameCount(items: NameCount[]): NameCount | null {
  if (items.length === 0) return null;
  return items.reduce((best, cur) => (cur.count > best.count ? cur : best));
}

function maxDayCount(items: DayCount[]): DayCount | null {
  if (items.length === 0) return null;
  return items.reduce((best, cur) => (cur.count > best.count ? cur : best));
}

function maxPair(items: SentimentPair[]): SentimentPair | null {
  if (items.length === 0) return null;
  return items.reduce((best, cur) => (cur.score > best.score ? cur : best));
}

function minPair(items: SentimentPair[]): SentimentPair | null {
  if (items.length === 0) return null;
  return items.reduce((best, cur) => (cur.score < best.score ? cur : best));
}

/** Best/worst of a pair list WITHOUT crowning the same person as both. With a
 *  single qualifying pair, max === min — the "X talks you up, X doesn't" bug —
 *  so the lone pair goes to whichever side its score actually supports, and a
 *  near-neutral lone pair (|score| < 0.05) is too ambivalent to crown at all. */
function splitPairPoles(items: SentimentPair[]): { best: SentimentPair | null; worst: SentimentPair | null } {
  const best = maxPair(items);
  const worst = minPair(items);
  if (!best || !worst || best.name !== worst.name) return { best, worst };
  if (best.score >= 0.05) return { best, worst: null };
  if (best.score <= -0.05) return { best: null, worst };
  return { best: null, worst: null };
}

function approvalPct(mean: number): number {
  return Math.round(((mean + 1) / 2) * 100);
}

/** Most one-sided fan callout: among things this member reacts heavily to
 *  (sent >= 30, sent >= 3x what they get back), pick the most extreme ratio. */
function findOneSided(fansOut: NameCount[], fansIn: NameCount[]): { name: string; sent: number; got: number } | null {
  const gotByName = new Map(fansIn.map(f => [f.name, f.count]));
  let best: { name: string; sent: number; got: number } | null = null;
  let bestRatio = -Infinity;
  for (const f of fansOut) {
    const got = gotByName.get(f.name) ?? 0;
    if (f.count < 30 || f.count < 3 * got) continue;
    const ratio = got === 0 ? Infinity : f.count / got;
    if (ratio > bestRatio) {
      bestRatio = ratio;
      best = { name: f.name, sent: f.count, got };
    }
  }
  return best;
}

/** Pure assembly: turns a member's folded aggregates + already-classified
 *  persona into the versioned stat blob. Thin data (empty arrays/maps) is
 *  left null/[] rather than zero-filled into a fake superlative. */
export function buildMemberStats(agg: MemberAggregates, persona: { label: string; blurb: string }): RecapStats {
  const messages = agg.days.reduce((s, d) => s + d.count, 0);
  const busiestDay = maxDayCount(agg.days);
  const dates = agg.days.map(d => d.date);

  let peakHour = 0;
  let peakCount = -1;
  for (const [h, c] of agg.hours) {
    if (c > peakCount) { peakCount = c; peakHour = h; }
  }

  const monologueRaw = agg.monologue && agg.monologue.content.trim().length > 0 ? agg.monologue : null;
  const monologue = monologueRaw
    ? {
        messageId: monologueRaw.messageId,
        words: tokenize(monologueRaw.content).length,
        date: monologueRaw.date,
        // Array spread splits on Unicode code points, not UTF-16 surrogate
        // halves — content.slice(0, 100) can cut an emoji in two.
        preview: [...monologueRaw.content].slice(0, 100).join(''),
      }
    : null;

  const polesIn = splitPairPoles(agg.pairsIn);
  const polesOut = splitPairPoles(agg.pairsOut);

  return {
    version: STATS_VERSION,
    member: agg.member,
    airtime: {
      messages,
      words: agg.text.words,
      shareOfChat: agg.totalChatMessages > 0 ? messages / agg.totalChatMessages : 0,
      rank: agg.rank,
      membersRanked: agg.membersRanked,
      busiestDay,
      peakHour,
      clockTag: clockTag(peakHour),
      longestStreakDays: longestStreak(dates),
      longestGapDays: longestGap(dates),
      binge: agg.binge,
    },
    reactions: {
      given: agg.reactionsGiven,
      received: agg.reactionsReceived,
      topGivenEmoji: maxNameCount(agg.emojiGiven),
      topReceivedEmoji: maxNameCount(agg.emojiReceived),
      biggestFan: maxNameCount(agg.fansIn),
      theyStan: maxNameCount(agg.fansOut),
      oneSided: findOneSided(agg.fansOut, agg.fansIn),
    },
    script: {
      catchphrases: topCatchphrases(agg.text.tokens, agg.text.words, agg.globalTokens, agg.globalWords),
      laughs: agg.text.laughs,
      capsShare: agg.text.messages > 0 ? agg.text.caps / agg.text.messages : 0,
      profanityCount: agg.text.profanity,
      profanityRank: agg.profanityRank,
      monologue,
    },
    fame: {
      mentions: agg.mentions,
      mainCharacterDay: maxDayCount(agg.mentionDays),
      approval: agg.approvalMean != null ? approvalPct(agg.approvalMean) : null,
      approvalTrend: agg.approvalTrend.map(w => ({ weekStart: w.weekStart, approval: approvalPct(w.mean) })),
      supporter: polesIn.best,
      nemesis: polesIn.worst,
      theyPraise: polesOut.best,
      theyRoast: polesOut.worst,
    },
    persona,
  };
}

function iso(d: unknown): string {
  return (d instanceof Date ? d : new Date(String(d))).toISOString().slice(0, 10);
}

function newAggregate(member: string, totalChatMessages: number): MemberAggregates {
  return {
    member,
    totalChatMessages,
    days: [],
    hours: new Map(),
    binge: null,
    reactionsGiven: 0,
    reactionsReceived: 0,
    emojiGiven: [],
    emojiReceived: [],
    fansIn: [],
    fansOut: [],
    mentions: 0,
    mentionDays: [],
    approvalMean: null,
    approvalTrend: [],
    sentimentGivenMean: null,
    pairsIn: [],
    pairsOut: [],
    monologue: null,
    text: EMPTY_TEXT,
    globalTokens: new Map(),
    globalWords: 0,
    rank: 0,
    membersRanked: 0,
    profanityRank: null,
  };
}

/** I/O stage: aggregates every stat family with one GROUP BY per family (no
 *  per-member queries), folds rows into per-member accumulators, classifies
 *  personas from cross-member percentiles, then upserts member_recap. */
export async function computeRecap(
  chatId: string,
  opts: { onProgress?: (p: RecapProgress) => void } = {},
): Promise<{ members: number }> {
  const sql = postgres(env.DATABASE_URL, { max: 1, keep_alive: 30, onnotice: () => {} });
  const report = (label: string, done = 0, total: number | null = null) => opts.onProgress?.({ label, done, total });
  try {
    await sql`SET statement_timeout = 0`;

    report('finding eligible members');
    const eligibleRows = await sql`
      SELECT m.username FROM members m
      LEFT JOIN member_profiles p ON p.chat_id = m.chat_id AND p.member_username = m.username
      WHERE m.chat_id = ${chatId} AND m.status <> 'removed'
        AND m.username <> 'Instagram User'
        AND coalesce(p.hidden, FALSE) = FALSE`;
    const eligible = new Set<string>(eligibleRows.map(r => r.username as string));
    if (eligible.size === 0) return { members: 0 };

    await sql`SET statement_timeout = 0`;
    const [totalRow] = await sql`
      SELECT count(*)::int AS total FROM messages
      WHERE chat_id = ${chatId} AND message_type = 'message'`;
    const totalChatMessages = (totalRow?.total as number) ?? 0;

    const accs = new Map<string, MemberAggregates>();
    for (const u of eligible) accs.set(u, newAggregate(u, totalChatMessages));

    await aggregateActivity(sql, chatId, eligible, accs, report);
    await aggregateReactions(sql, chatId, eligible, accs, report);
    await aggregateMentions(sql, chatId, eligible, accs, report);
    await aggregateSentiment(sql, chatId, eligible, accs, report);
    await aggregateMonologue(sql, chatId, eligible, accs, report);
    await runTextPass(sql, chatId, eligible, accs, report);

    const personas = finalizeRanksAndPersonas(accs);

    await sql`SET statement_timeout = 0`;
    report('writing blobs…', 0, accs.size);
    const members = [...accs.values()];
    let written = 0;
    for (const batch of chunkArray(members, 50)) {
      const rows = batch.map(agg => ({
        chat_id: chatId,
        member_username: agg.member,
        stats: sql.json(buildMemberStats(agg, personas.get(agg.member)!)),
        stats_version: STATS_VERSION,
        computed_at: new Date(),
      }));
      await sql`
        INSERT INTO member_recap ${sql(rows, 'chat_id', 'member_username', 'stats', 'stats_version', 'computed_at')}
        ON CONFLICT (chat_id, member_username)
        DO UPDATE SET stats = EXCLUDED.stats, stats_version = EXCLUDED.stats_version, computed_at = EXCLUDED.computed_at`;
      written += batch.length;
      report('writing blobs…', written, accs.size);
    }

    const eligibleArray = [...eligible];
    await sql`DELETE FROM member_recap WHERE chat_id = ${chatId} AND member_username <> ALL(${eligibleArray}::text[])`;

    return { members: accs.size };
  } finally {
    await sql.end();
  }
}

function chunkArray<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

// ---------------------------------------------------------------------------
// Per-family aggregation helpers. Each does exactly one (or a few, tightly
// related) GROUP BY query over the whole chat and folds rows into accs.
// ---------------------------------------------------------------------------

async function aggregateActivity(
  sql: Sql, chatId: string, eligible: Set<string>, accs: Map<string, MemberAggregates>,
  report: (label: string, done?: number, total?: number | null) => void,
): Promise<void> {
  report('aggregating daily activity');
  await sql`SET statement_timeout = 0`;
  for (const r of await sql`
    SELECT sender, timestamp::date AS day, count(*)::int AS n
    FROM messages WHERE chat_id = ${chatId} AND message_type = 'message'
    GROUP BY 1, 2`) {
    const a = accs.get(r.sender as string);
    if (a) a.days.push({ date: iso(r.day), count: r.n as number });
  }

  // Bucket in local time, not UTC — this is a New York group, so raw UTC hours
  // (EXTRACT/date_trunc on a TIMESTAMPTZ default to UTC) shifted evening
  // activity into the 1am-7am bucket and mislabeled ~40% of members "3am
  // poster". Hardcoded TZ is fine for v1 (single-chat); a per-chat-config
  // timezone is a candidate for when a second chat/timezone shows up.
  report('aggregating hourly activity');
  await sql`SET statement_timeout = 0`;
  for (const r of await sql`
    SELECT sender, EXTRACT(hour FROM timestamp AT TIME ZONE 'America/New_York')::int AS h, count(*)::int AS n
    FROM messages WHERE chat_id = ${chatId} AND message_type = 'message'
    GROUP BY 1, 2`) {
    const a = accs.get(r.sender as string);
    if (a) a.hours.set(r.h as number, (a.hours.get(r.h as number) ?? 0) + (r.n as number));
  }

  report('finding binge sessions');
  await sql`SET statement_timeout = 0`;
  // ::text keeps the local wall-clock digits intact — date_trunc on the
  // AT TIME ZONE result is a naive timestamp, and letting the driver parse
  // it into a Date re-interprets the digits in the SERVER's timezone (then
  // toISOString shifts them again — Vercel runs UTC, local dev runs NY).
  for await (const rows of sql`
    SELECT sender, date_trunc('hour', timestamp AT TIME ZONE 'America/New_York')::text AS hs, count(*)::int AS n
    FROM messages WHERE chat_id = ${chatId} AND message_type = 'message'
    GROUP BY 1, 2`.cursor(5000)) {
    for (const r of rows) {
      const a = accs.get(r.sender as string);
      if (!a) continue;
      const n = r.n as number;
      if (!a.binge || n > a.binge.count) {
        // 'YYYY-MM-DD HH:00:00' -> naive local ISO 'YYYY-MM-DDTHH:00:00' (no Z).
        a.binge = { hourStart: (r.hs as string).replace(' ', 'T'), count: n };
      }
    }
  }
}

async function aggregateReactions(
  sql: Sql, chatId: string, eligible: Set<string>, accs: Map<string, MemberAggregates>,
  report: (label: string, done?: number, total?: number | null) => void,
): Promise<void> {
  report('aggregating reactions given');
  await sql`SET statement_timeout = 0`;
  for (const r of await sql`
    SELECT r.reactor, count(*)::int AS n
    FROM reactions r JOIN messages m ON m.id = r.message_id
    WHERE m.chat_id = ${chatId} GROUP BY 1`) {
    const a = accs.get(r.reactor as string);
    if (a) a.reactionsGiven = r.n as number;
  }

  report('aggregating reactions received');
  await sql`SET statement_timeout = 0`;
  for (const r of await sql`
    SELECT m.sender, count(*)::int AS n
    FROM reactions r JOIN messages m ON m.id = r.message_id
    WHERE m.chat_id = ${chatId} GROUP BY 1`) {
    const a = accs.get(r.sender as string);
    if (a) a.reactionsReceived = r.n as number;
  }

  report('aggregating emoji given');
  await sql`SET statement_timeout = 0`;
  for (const r of await sql`
    SELECT r.reactor, r.emoji, count(*)::int AS n
    FROM reactions r JOIN messages m ON m.id = r.message_id
    WHERE m.chat_id = ${chatId} GROUP BY 1, 2`) {
    const a = accs.get(r.reactor as string);
    if (a) a.emojiGiven.push({ name: r.emoji as string, count: r.n as number });
  }

  report('aggregating emoji received');
  await sql`SET statement_timeout = 0`;
  for (const r of await sql`
    SELECT m.sender, r.emoji, count(*)::int AS n
    FROM reactions r JOIN messages m ON m.id = r.message_id
    WHERE m.chat_id = ${chatId} GROUP BY 1, 2`) {
    const a = accs.get(r.sender as string);
    if (a) a.emojiReceived.push({ name: r.emoji as string, count: r.n as number });
  }

  report('aggregating fan pairs');
  await sql`SET statement_timeout = 0`;
  for (const r of await sql`
    SELECT r.reactor, m.sender, count(*)::int AS n
    FROM reactions r JOIN messages m ON m.id = r.message_id
    WHERE m.chat_id = ${chatId} GROUP BY 1, 2`) {
    const reactor = r.reactor as string;
    const sender = r.sender as string;
    const n = r.n as number;
    // accs.get(owner) already implies the OWNER side is eligible; the NAMED
    // counterpart (the other name in the pair) needs its own eligible check
    // or ineligible members (e.g. the "Instagram User" pseudo-member) show
    // up as a named superlative (biggestFan/theyStan).
    const target = accs.get(sender);
    if (target && eligible.has(reactor)) target.fansIn.push({ name: reactor, count: n });
    const source = accs.get(reactor);
    if (source && eligible.has(sender)) source.fansOut.push({ name: sender, count: n });
  }
}

async function aggregateMentions(
  sql: Sql, chatId: string, eligible: Set<string>, accs: Map<string, MemberAggregates>,
  report: (label: string, done?: number, total?: number | null) => void,
): Promise<void> {
  report('aggregating mentions');
  await sql`SET statement_timeout = 0`;
  for (const r of await sql`
    SELECT member_username, count(*)::int AS n
    FROM message_mentions WHERE chat_id = ${chatId} GROUP BY 1`) {
    const a = accs.get(r.member_username as string);
    if (a) a.mentions = r.n as number;
  }

  report('aggregating mention days');
  await sql`SET statement_timeout = 0`;
  for (const r of await sql`
    SELECT mm.member_username, m.timestamp::date AS day, count(*)::int AS n
    FROM message_mentions mm JOIN messages m ON m.id = mm.message_id
    WHERE mm.chat_id = ${chatId} GROUP BY 1, 2`) {
    const a = accs.get(r.member_username as string);
    if (a) a.mentionDays.push({ date: iso(r.day), count: r.n as number });
  }
}

async function aggregateSentiment(
  sql: Sql, chatId: string, eligible: Set<string>, accs: Map<string, MemberAggregates>,
  report: (label: string, done?: number, total?: number | null) => void,
): Promise<void> {
  report('aggregating approval');
  await sql`SET statement_timeout = 0`;
  for (const r of await sql`
    SELECT member_username, avg(pair_score)::float AS mean
    FROM (
      SELECT s.message_id, s.member_username, avg(s.sentiment_score) AS pair_score
      FROM mention_sentiments s JOIN messages msg ON msg.id = s.message_id
      WHERE s.chat_id = ${chatId} AND s.confidence > 0
        AND msg.sender <> s.member_username
      GROUP BY s.message_id, s.member_username
    ) pairs
    GROUP BY member_username`) {
    const a = accs.get(r.member_username as string);
    if (a) a.approvalMean = r.mean as number;
  }

  report('aggregating sentiment given');
  await sql`SET statement_timeout = 0`;
  for (const r of await sql`
    SELECT author, avg(pair_score)::float AS mean
    FROM (
      SELECT msg.sender AS author, s.message_id, s.member_username,
             avg(s.sentiment_score) AS pair_score
      FROM mention_sentiments s JOIN messages msg ON msg.id = s.message_id
      WHERE s.chat_id = ${chatId} AND s.confidence > 0
      GROUP BY msg.sender, s.message_id, s.member_username
    ) pairs
    GROUP BY author`) {
    const a = accs.get(r.author as string);
    if (a) a.sentimentGivenMean = r.mean as number;
  }

  report('aggregating sentiment pairs');
  await sql`SET statement_timeout = 0`;
  for (const r of await sql`
    SELECT author, target, avg(pair_score)::float AS score, count(*)::int AS n
    FROM (
      SELECT msg.sender AS author, s.member_username AS target, s.message_id,
             avg(s.sentiment_score) AS pair_score
      FROM mention_sentiments s JOIN messages msg ON msg.id = s.message_id
      WHERE s.chat_id = ${chatId} AND s.confidence > 0
      GROUP BY msg.sender, s.member_username, s.message_id
    ) pairs
    GROUP BY author, target HAVING count(*) >= 10`) {
    const author = r.author as string;
    const target = r.target as string;
    if (author === target) continue; // self-mentions don't count as fame relationships
    const score = r.score as number;
    const count = r.n as number;
    // Same named-counterpart eligibility check as the fan pairs above.
    const targetAcc = accs.get(target);
    if (targetAcc && eligible.has(author)) targetAcc.pairsIn.push({ name: author, score, count });
    const authorAcc = accs.get(author);
    if (authorAcc && eligible.has(target)) authorAcc.pairsOut.push({ name: target, score, count });
  }

  report('aggregating sentiment trend');
  await sql`SET statement_timeout = 0`;
  const trendRows = new Map<string, WeekMean[]>();
  for (const r of await sql`
    SELECT member_username, w, avg(pair_score)::float AS mean
    FROM (
      SELECT s.member_username, s.message_id,
             date_trunc('week', msg.timestamp)::date AS w,
             avg(s.sentiment_score) AS pair_score
      FROM mention_sentiments s JOIN messages msg ON msg.id = s.message_id
      WHERE s.chat_id = ${chatId} AND s.confidence > 0
        AND msg.sender <> s.member_username
      GROUP BY s.member_username, s.message_id, date_trunc('week', msg.timestamp)::date
    ) pairs
    GROUP BY member_username, w`) {
    const member = r.member_username as string;
    if (!eligible.has(member)) continue;
    let list = trendRows.get(member);
    if (!list) { list = []; trendRows.set(member, list); }
    list.push({ weekStart: iso(r.w), mean: r.mean as number });
  }
  for (const [member, list] of trendRows) {
    list.sort((a, b) => a.weekStart.localeCompare(b.weekStart));
    const a = accs.get(member);
    if (a) a.approvalTrend = list.slice(-8);
  }
}

async function aggregateMonologue(
  sql: Sql, chatId: string, eligible: Set<string>, accs: Map<string, MemberAggregates>,
  report: (label: string, done?: number, total?: number | null) => void,
): Promise<void> {
  report('finding monologues');
  await sql`SET statement_timeout = 0`;
  for (const r of await sql`
    SELECT DISTINCT ON (sender) sender, id, timestamp, content
    FROM messages WHERE chat_id = ${chatId} AND message_type = 'message'
    ORDER BY sender, length(content) DESC`) {
    const a = accs.get(r.sender as string);
    if (a) a.monologue = { messageId: r.id as string, date: iso(r.timestamp), content: r.content as string };
  }
}

async function runTextPass(
  sql: Sql, chatId: string, eligible: Set<string>, accs: Map<string, MemberAggregates>,
  report: (label: string, done?: number, total?: number | null) => void,
): Promise<void> {
  await sql`SET statement_timeout = 0`;
  const [totalRow] = await sql`
    SELECT count(*)::int AS total FROM messages
    WHERE chat_id = ${chatId} AND message_type = 'message' AND content <> ''`;
  const total = (totalRow?.total as number) ?? 0;

  const tally = new TextTally();
  let scanned = 0;
  let sincePrune = 0;
  report('scanning text…', 0, total);
  for await (const rows of sql`
    SELECT sender, content FROM messages
    WHERE chat_id = ${chatId} AND message_type = 'message' AND content <> ''`.cursor(5000)) {
    for (const r of rows) {
      const sender = r.sender as string;
      if (eligible.has(sender)) tally.add(sender, r.content as string);
      scanned += 1;
      sincePrune += 1;
    }
    if (sincePrune >= 100_000) {
      tally.prune();
      sincePrune = 0;
    }
    report('scanning text…', scanned, total);
  }

  const globalWords = [...tally.perMember.values()].reduce((s, m) => s + m.words, 0);
  for (const [member, a] of accs) {
    a.text = tally.perMember.get(member) ?? EMPTY_TEXT;
    a.globalTokens = tally.globalTokens;
    a.globalWords = globalWords;
  }
}

// ---------------------------------------------------------------------------
// Cross-member ranking + persona classification (needs every member's
// aggregate assembled first, so it runs after all queries complete).
// ---------------------------------------------------------------------------

function finalizeRanksAndPersonas(accs: Map<string, MemberAggregates>): Map<string, { label: string; blurb: string }> {
  const members = [...accs.values()];
  const membersRanked = members.length;

  const volumeOf = (a: MemberAggregates) => a.days.reduce((s, d) => s + d.count, 0);
  const byVolumeDesc = [...members].sort((a, b) => volumeOf(b) - volumeOf(a));
  byVolumeDesc.forEach((a, i) => { a.rank = i + 1; a.membersRanked = membersRanked; });

  const withProfanity = members.filter(a => a.text.profanity > 0).sort((a, b) => b.text.profanity - a.text.profanity);
  withProfanity.forEach((a, i) => { a.profanityRank = i + 1; });

  const volumeMap = new Map<string, number>();
  const nightOwlMap = new Map<string, number>();
  const givenPerMsgMap = new Map<string, number>();
  const receivedPerMsgMap = new Map<string, number>();
  const sentimentGivenMap = new Map<string, number>();
  const approvalMap = new Map<string, number>();
  const mentionsMap = new Map<string, number>();
  const laughShareMap = new Map<string, number>();
  const capsShareMap = new Map<string, number>();
  const profanityPerMsgMap = new Map<string, number>();

  for (const a of members) {
    const messages = volumeOf(a);
    volumeMap.set(a.member, messages);
    let nightOwlCount = 0;
    for (const [h, c] of a.hours) if (h >= 0 && h <= 5) nightOwlCount += c;
    nightOwlMap.set(a.member, messages > 0 ? nightOwlCount / messages : 0);
    givenPerMsgMap.set(a.member, messages > 0 ? a.reactionsGiven / messages : 0);
    receivedPerMsgMap.set(a.member, messages > 0 ? a.reactionsReceived / messages : 0);
    // null (never mentioned / never authored sentiment) is deliberately
    // treated as neutral 0 here — it's a persona percentile input, not a
    // displayed stat, so a quiet member lands mid-pack rather than being
    // excluded from classification entirely.
    sentimentGivenMap.set(a.member, a.sentimentGivenMean ?? 0);
    approvalMap.set(a.member, a.approvalMean ?? 0);
    mentionsMap.set(a.member, a.mentions);
    // Text-derived shares use the text pass's own message count (real
    // messages with content) so media-only messages don't dilute them.
    const textMsgs = a.text.messages;
    laughShareMap.set(a.member, textMsgs > 0 ? a.text.laughs / textMsgs : 0);
    capsShareMap.set(a.member, textMsgs > 0 ? a.text.caps / textMsgs : 0);
    profanityPerMsgMap.set(a.member, textMsgs > 0 ? a.text.profanity / textMsgs : 0);
  }

  const pctVolume = percentileMap(volumeMap);
  const pctNightOwl = percentileMap(nightOwlMap);
  const pctGiven = percentileMap(givenPerMsgMap);
  const pctReceived = percentileMap(receivedPerMsgMap);
  const pctSentimentGiven = percentileMap(sentimentGivenMap);
  const pctApproval = percentileMap(approvalMap);
  const pctMentions = percentileMap(mentionsMap);
  const pctLaughShare = percentileMap(laughShareMap);
  const pctCapsShare = percentileMap(capsShareMap);
  const pctProfanity = percentileMap(profanityPerMsgMap);

  const personas = new Map<string, { label: string; blurb: string }>();
  for (const a of members) {
    const inputs: PersonaInputs = {
      volume: pctVolume.get(a.member) ?? 0.5,
      nightOwl: pctNightOwl.get(a.member) ?? 0.5,
      givenPerMsg: pctGiven.get(a.member) ?? 0.5,
      receivedPerMsg: pctReceived.get(a.member) ?? 0.5,
      sentimentGiven: pctSentimentGiven.get(a.member) ?? 0.5,
      approval: pctApproval.get(a.member) ?? 0.5,
      mentions: pctMentions.get(a.member) ?? 0.5,
      laughShare: pctLaughShare.get(a.member) ?? 0.5,
      capsShare: pctCapsShare.get(a.member) ?? 0.5,
      profanityPerMsg: pctProfanity.get(a.member) ?? 0.5,
    };
    personas.set(a.member, classifyPersona(inputs));
  }
  return personas;
}
