import type { RecapStats } from './types';

/** One slide of the Recap story. `accent` (0–4) cycles the card color theme;
 *  it's assigned by push() in built order, not stored per-key. */
export type RecapCard = {
  key: string;
  kicker: string;
  big: string;
  sub?: string;
  detail?: string;
  link?: { kind: 'rewind'; at: string } | { kind: 'player'; messageId: string };
  /** Usernames named in this card's copy (biggestFan, theyStan, supporter,
   *  nemesis, ...) — the overlay renders a pfp+display-name row for each,
   *  resolved via the API's `names` map. */
  people?: string[];
  accent: number;
};

const fmt = (n: number) => n.toLocaleString('en-US');
const pct = (fraction: number) => `${(fraction * 100).toFixed(1)}%`;

function formatHour(hour: number): string {
  const period = hour < 12 ? 'AM' : 'PM';
  const hour12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${hour12} ${period}`;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "YYYY-MM-DD" -> "Apr 12". Shared by every date-bearing card. */
function formatDate(dateStr: string): string {
  const [, m, d] = dateStr.split('-').map(Number);
  return `${MONTHS[(m ?? 1) - 1]} ${d}`;
}

/** Binge's hourStart is a naive local-time ISO string ('YYYY-MM-DDTHH:00:00',
 *  no Z — compute.ts buckets in America/New_York and keeps the wall-clock
 *  digits as text). Parse the digits directly; a Date would re-interpret
 *  them in the viewer's timezone. */
function formatBingeSub(hourStart: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2})/.exec(hourStart);
  if (!m) return hourStart;
  return `${MONTHS[Number(m[2]) - 1]} ${Number(m[3])} · ${formatHour(Number(m[4]))}`;
}

/** "climbing" / "falling" / "steady" from the first vs last trend point. */
function trendDirection(trend: RecapStats['fame']['approvalTrend']): string | null {
  if (trend.length < 2) return null;
  const delta = trend[trend.length - 1]!.approval - trend[0]!.approval;
  if (delta >= 5) return 'climbing';
  if (delta <= -5) return 'falling';
  return 'steady';
}

/** Builds the full ordered Recap slide sequence for one member. Pure
 *  function — every card is guarded by a data-presence rule so a quiet
 *  member never sees a zero-filled superlative. */
export function buildCards(s: RecapStats, displayName: string): RecapCard[] {
  const cards: RecapCard[] = [];
  const push = (c: Omit<RecapCard, 'accent'>) => cards.push({ ...c, accent: cards.length % 5 });

  // ── intro ──────────────────────────────────────────────────────
  push({
    key: 'intro',
    kicker: 'NETFLIXIA PRESENTS',
    big: `The ${displayName} Recap`,
    sub: 'All-time. Every episode. Tap through.',
  });

  // ── airtime ────────────────────────────────────────────────────
  push({
    key: 'airtime',
    kicker: 'You aired',
    big: `${fmt(s.airtime.messages)} episodes`,
    sub: `${fmt(s.airtime.words)} words — ${pct(s.airtime.shareOfChat)} of everything ever said`,
    detail: `#${s.airtime.rank} of ${s.airtime.membersRanked} shows`,
  });

  // ── busiest-day (skip: no busiest day recorded) ──────────────────
  if (s.airtime.busiestDay) {
    push({
      key: 'busiest-day',
      kicker: 'Your season finale',
      big: `${fmt(s.airtime.busiestDay.count)} messages in one day`,
      sub: formatDate(s.airtime.busiestDay.date),
      link: { kind: 'rewind', at: `${s.airtime.busiestDay.date}T20:00` },
    });
  }

  // ── clock (skip: no messages, so no real peak hour) ───────────
  if (s.airtime.messages > 0) {
    push({
      key: 'clock',
      kicker: 'Prime time',
      big: s.airtime.clockTag,
      sub: `Peak posting hour: ${formatHour(s.airtime.peakHour)} (NYC time)`,
    });
  }

  // ── streak (skip: no multi-day streak) ────────────────────────
  if (s.airtime.longestStreakDays >= 2) {
    push({
      key: 'streak',
      kicker: 'On a roll',
      big: `Longest streak: ${fmt(s.airtime.longestStreakDays)} days`,
      sub: s.airtime.longestGapDays > 0
        ? `Longest gap: ${fmt(s.airtime.longestGapDays)} days without a word`
        : 'Never missed a day',
    });
  }

  // ── binge (skip: no standout hour) ────────────────────────────
  if (s.airtime.binge) {
    push({
      key: 'binge',
      kicker: 'Binge session',
      big: `${fmt(s.airtime.binge.count)} messages in one hour`,
      sub: `${formatBingeSub(s.airtime.binge.hourStart)} (NYC time)`,
    });
  }

  // ── reaction-economy (skip: no reactions given or received) ──
  if (s.reactions.given + s.reactions.received > 0) {
    push({
      key: 'reaction-economy',
      kicker: 'Reaction economy',
      big: `${fmt(s.reactions.received)} received, ${fmt(s.reactions.given)} given`,
      sub: s.reactions.received === s.reactions.given
        ? 'Perfectly balanced'
        : s.reactions.received > s.reactions.given
          ? 'You take more than you give'
          : 'You give more than you take',
    });
  }

  // ── emoji (skip: no top emoji either direction) ───────────────
  if (s.reactions.topGivenEmoji || s.reactions.topReceivedEmoji) {
    const given = s.reactions.topGivenEmoji;
    const received = s.reactions.topReceivedEmoji;
    push({
      key: 'emoji',
      kicker: 'Your emoji',
      big: given ? given.name : received!.name,
      sub: given && received
        ? `Your go-to: ${given.name} (${fmt(given.count)}×) — you mostly got: ${received.name} (${fmt(received.count)}×)`
        : given
          ? `Used ${fmt(given.count)} times`
          : `Received ${fmt(received!.count)} times`,
    });
  }

  // ── fans (skip: no biggest fan or theyStan) ───────────────────
  if (s.reactions.biggestFan || s.reactions.theyStan) {
    const fan = s.reactions.biggestFan;
    const stan = s.reactions.theyStan;
    push({
      key: 'fans',
      kicker: 'Fandom',
      big: fan ? `${fan.name} is your biggest fan` : `You stan ${stan!.name}`,
      sub: fan && stan
        ? `${fan.name} reacted to you ${fmt(fan.count)} times — you reacted to ${stan.name} ${fmt(stan.count)} times`
        : fan
          ? `Reacted to you ${fmt(fan.count)} times`
          : `You reacted to ${stan!.name} ${fmt(stan!.count)} times`,
      detail: s.reactions.oneSided
        ? `One-sided: you sent ${fmt(s.reactions.oneSided.sent)} to ${s.reactions.oneSided.name}, got ${fmt(s.reactions.oneSided.got)} back`
        : undefined,
      people: [...new Set([fan?.name, stan?.name, s.reactions.oneSided?.name].filter((n): n is string => !!n))],
    });
  }

  // ── catchphrase (skip: no recurring phrase) ───────────────────
  if (s.script.catchphrases.length > 0) {
    const top = s.script.catchphrases[0]!;
    push({
      key: 'catchphrase',
      kicker: 'Catchphrase',
      big: `"${top.phrase}"`,
      sub: `Said ${fmt(top.count)} times — ${top.ratio.toFixed(1)}× the group average`,
    });
  }

  // ── laugh-track (skip: no laughs, no shouting, no profanity) ──
  if (s.script.laughs > 0 || s.script.capsShare > 0 || s.script.profanityCount > 0) {
    push({
      key: 'laugh-track',
      kicker: 'Laugh track',
      big: `${fmt(s.script.laughs)} laughs on record`,
      sub: `Counting every lmao, lol, haha, 💀 and 😭 you sent — and ${pct(s.script.capsShare)} of your messages were SHOUTED (all-caps)`,
      detail: s.script.profanityCount > 0
        ? `${fmt(s.script.profanityCount)} curse words used${s.script.profanityRank ? ` — #${s.script.profanityRank} filthiest mouth in the chat` : ''}`
        : undefined,
    });
  }

  // ── monologue (skip: no standout long message) ────────────────
  if (s.script.monologue) {
    push({
      key: 'monologue',
      kicker: 'Monologue',
      big: `${fmt(s.script.monologue.words)}-word monologue`,
      sub: `"${s.script.monologue.preview}"`,
      detail: `Your longest message ever · ${s.script.monologue.date}`,
      link: { kind: 'player', messageId: s.script.monologue.messageId },
    });
  }

  // ── fame (skip: never mentioned) ───────────────────────────────
  if (s.fame.mentions > 0) {
    push({
      key: 'fame',
      kicker: 'Fame',
      big: `${fmt(s.fame.mentions)} times you came up in conversation`,
      sub: s.fame.mainCharacterDay
        ? `Main character day: ${s.fame.mainCharacterDay.date} (${fmt(s.fame.mainCharacterDay.count)} mentions)`
        : undefined,
    });
  }

  // ── approval (skip: never mentioned with sentiment) ────────────
  if (s.fame.approval !== null) {
    const direction = trendDirection(s.fame.approvalTrend);
    push({
      key: 'approval',
      kicker: 'Approval rating',
      big: `${s.fame.approval}% approval`,
      sub: direction ? `Trending ${direction}` : undefined,
    });
  }

  // ── supporter-nemesis (skip: neither exists) ───────────────────
  // compute.ts guarantees supporter/nemesis are different people
  // (splitPairPoles); the name check here is belt-and-braces for blobs
  // written before that fix, where one lone author could be crowned both.
  if (s.fame.supporter || s.fame.nemesis) {
    const { supporter, nemesis, theyPraise, theyRoast } = s.fame;
    const bothDistinct = !!supporter && !!nemesis && supporter.name !== nemesis.name;
    push({
      key: 'supporter-nemesis',
      kicker: 'Supporting cast',
      big: supporter ? `${supporter.name} has your back` : `${nemesis!.name} isn't your biggest fan`,
      sub: bothDistinct
        ? `${supporter.name} talks you up — ${nemesis!.name} doesn't`
        : supporter
          ? `Talks you up the most`
          : `Talks you down the most`,
      detail: [
        theyPraise && (!theyRoast || theyPraise.name !== theyRoast.name) ? `You talk up ${theyPraise.name}` : null,
        theyRoast && (!theyPraise || theyPraise.name !== theyRoast.name) ? `You talk down ${theyRoast.name}` : null,
        'Scored from how everyone talks about each other',
      ].filter(Boolean).join(' — '),
      people: [...new Set([supporter?.name, nemesis?.name, theyPraise?.name, theyRoast?.name].filter((n): n is string => !!n))],
    });
  }

  // ── persona (always) ────────────────────────────────────────────
  push({
    key: 'persona',
    kicker: 'Your type',
    big: s.persona.label,
    sub: s.persona.blurb,
  });

  // ── finale (always) ─────────────────────────────────────────────
  push({
    key: 'finale',
    kicker: "That's a wrap",
    big: `${displayName}, wrapped`,
    sub: `${s.persona.label} — ${fmt(s.airtime.messages)} episodes · ${fmt(s.airtime.words)} words · ${fmt(s.reactions.received)} reactions · ${fmt(s.fame.mentions)} mentions`,
  });

  return cards;
}
