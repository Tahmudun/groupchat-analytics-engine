import type { ArtSpec, ShowArt } from './art';
import { fmtCompact, fmtDelta, deltaFraction, mediaUrl } from './format';
import type { Frame } from './frame';
import type { CustomEntry } from './data';

/** One member's precomputed weekly numbers (weekly_stats row + profile join). */
export type WeeklyStat = {
  member_username: string;
  display_name: string;
  week_end: string;
  first_message_at: string;
  last_active_at: string;
  messages_all_time: number;
  messages_7d: number;
  messages_prev7: number;
  reactions_7d: number;
  weekly_score: number;
  prev_score: number;
  mentions_7d: number;
  mention_sentiment_mean: number | null;
  mention_sentiment_stddev: number | null;
  hidden: boolean;
  avatar_url: string | null;
  banner_url: string | null;
  banner_preset: string | null;
  banner_frame?: Frame | null; // admin-chosen crop for wide renders (billboard)
  poster_frame?: Frame | null; // admin-chosen crop for the tall poster cards
  show_art?: ShowArt;          // resolved per-target artwork (card/heroes)
};

export type CategoryCard = {
  username: string;
  displayName: string;
  caption: string;
  avatarUrl: string | null;
  preset: string | null;
  art: ArtSpec;
};

export type CategoryRow = {
  id: string;
  title: string;
  blurb: string;
  ranked?: boolean; // Top 10 gets the giant outlined rank digits
  cards: CategoryCard[];
};

const MIN_MEMBERS = 3;
const ROW_CAP = 10;
const MENTION_GATE = 5;
const FAN_FAV_MIN_MESSAGES = 20;
const NEWLY_ADDED_DAYS = 30;

function card(s: WeeklyStat, caption: string): CategoryCard {
  return {
    username: s.member_username,
    displayName: s.display_name,
    caption,
    avatarUrl: s.avatar_url,
    preset: s.banner_preset,
    art: s.show_art?.card ?? { url: s.banner_url, frame: s.poster_frame ?? null, fit: 'cover' },
  };
}

/** A custom-row entry resolved for PosterCard. Member entries use the
 *  member's LIVE art/name (same resolution as computed rows) so Shows-editor
 *  changes propagate; anything unresolvable degrades to a keyart card. */
export type CustomCard = {
  key: string;
  href: string;
  title: string;
  caption: string | null;
  preset: string | null;
  seed: string;
  art: ArtSpec;
};

export function customEntryCard(e: CustomEntry, statsByUsername: Map<string, WeeklyStat>): CustomCard {
  const s = e.memberUsername ? statsByUsername.get(e.memberUsername) : undefined;
  if (s) {
    return {
      key: `entry-${e.id}`,
      href: `/member/${encodeURIComponent(s.member_username)}`,
      title: s.display_name,
      caption: e.subtitle,
      preset: s.banner_preset,
      seed: s.member_username,
      art: s.show_art?.card ?? { url: s.banner_url, frame: s.poster_frame ?? null, fit: 'cover' },
    };
  }
  return {
    key: `entry-${e.id}`,
    href: '#',
    title: e.title,
    caption: e.subtitle,
    preset: e.posterPreset,
    seed: e.title,
    art: { url: mediaUrl(e.posterUrl), frame: null, fit: 'cover' },
  };
}

/** signed movement fraction vs previous week (symmetric, bounded ±200%). */
function delta(s: WeeklyStat): number {
  return deltaFraction(s.weekly_score, s.prev_score);
}

function sentimentPct(mean: number): number {
  return Math.round(((mean + 1) / 2) * 100); // [-1,1] → [0,100]
}

type Def = {
  id: string;
  title: string;
  blurb: string;
  ranked?: boolean;
  qualifies: (s: WeeklyStat) => boolean;
  rank: (a: WeeklyStat, b: WeeklyStat) => number; // sort comparator (best first)
  caption: (s: WeeklyStat) => string;
};

const DEFS: Def[] = [
  {
    id: 'top10',
    title: 'Top 10 on Flix this week',
    blurb: 'Highest weekly score',
    ranked: true,
    qualifies: s => s.messages_7d > 0,
    rank: (a, b) => b.weekly_score - a.weekly_score,
    caption: s => `${Math.round(s.weekly_score).toLocaleString()} pts`,
  },
  {
    id: 'trending',
    title: 'Trending Now',
    blurb: 'Rising fastest this week',
    qualifies: s => s.messages_7d > 0 && s.weekly_score > s.prev_score,
    rank: (a, b) => b.weekly_score - b.prev_score - (a.weekly_score - a.prev_score),
    caption: s => fmtDelta(delta(s)),
  },
  {
    id: 'falling',
    title: 'Falling Off',
    blurb: 'The biggest drop',
    qualifies: s => s.messages_7d > 0 && s.weekly_score < s.prev_score,
    rank: (a, b) => (a.weekly_score - a.prev_score) - (b.weekly_score - b.prev_score),
    caption: s => fmtDelta(delta(s)),
  },
  {
    id: 'drama',
    title: 'Drama',
    blurb: 'Most divisive mentions',
    qualifies: s => s.mentions_7d >= MENTION_GATE && s.mention_sentiment_stddev != null,
    rank: (a, b) => (b.mention_sentiment_stddev ?? 0) - (a.mention_sentiment_stddev ?? 0),
    caption: s => `${s.mentions_7d} mentions`,
  },
  {
    id: 'acclaimed',
    title: 'Critically Acclaimed',
    blurb: 'Best-loved this week',
    qualifies: s => s.mentions_7d >= MENTION_GATE && s.mention_sentiment_mean != null,
    rank: (a, b) => (b.mention_sentiment_mean ?? 0) - (a.mention_sentiment_mean ?? 0),
    caption: s => `${sentimentPct(s.mention_sentiment_mean!)}% positive`,
  },
  {
    id: 'bingeworthy',
    title: 'Bingeworthy',
    blurb: "Can't stop posting",
    qualifies: s => s.messages_7d > 0,
    rank: (a, b) => b.messages_7d - a.messages_7d,
    caption: s => `${fmtCompact(s.messages_7d)} eps`,
  },
  {
    id: 'fan_favorites',
    title: 'Fan Favorites',
    blurb: 'Most reactions per post',
    qualifies: s => s.messages_7d >= FAN_FAV_MIN_MESSAGES,
    rank: (a, b) => b.reactions_7d / b.messages_7d - a.reactions_7d / a.messages_7d,
    caption: s => `${(s.reactions_7d / s.messages_7d).toFixed(1)} rx/ep`,
  },
  {
    id: 'newly_added',
    title: 'Newly Added',
    blurb: 'New on Flix',
    qualifies: s => s.messages_7d > 0 && withinNewWindow(s),
    rank: (a, b) => b.messages_7d - a.messages_7d,
    caption: () => 'New',
  },
];

function withinNewWindow(s: WeeklyStat): boolean {
  const weekEnd = new Date(`${s.week_end}T00:00:00Z`).getTime();
  const first = new Date(s.first_message_at).getTime();
  return weekEnd - first <= NEWLY_ADDED_DAYS * 86400000;
}

export function buildCategoryRows(stats: WeeklyStat[]): CategoryRow[] {
  const visible = stats.filter(s => !s.hidden);
  const rows: CategoryRow[] = [];
  for (const def of DEFS) {
    const cards = visible
      .filter(def.qualifies)
      .sort(def.rank)
      .slice(0, ROW_CAP)
      .map(s => card(s, def.caption(s)));
    if (cards.length >= MIN_MEMBERS) {
      rows.push({ id: def.id, title: def.title, blurb: def.blurb, ranked: def.ranked, cards });
    }
  }
  return rows;
}
