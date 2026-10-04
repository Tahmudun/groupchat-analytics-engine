/** Versioned stat blob stored in member_recap.stats. Bump STATS_VERSION on
 *  any shape change; the API refuses to serve older rows. */
export const STATS_VERSION = 1;

export type NameCount = { name: string; count: number };

export type RecapStats = {
  version: number;
  member: string;
  airtime: {
    messages: number;
    words: number;
    shareOfChat: number;          // 0..1 fraction of all real messages
    rank: number;                 // 1-based among ranked members
    membersRanked: number;
    busiestDay: { date: string; count: number } | null;
    peakHour: number;             // 0..23
    clockTag: string;             // "3am poster" | "morning show" | "daytime TV" | "primetime"
    longestStreakDays: number;
    longestGapDays: number;
    binge: { hourStart: string; count: number } | null; // naive local-time ISO ('YYYY-MM-DDTHH:00:00', no Z)
  };
  reactions: {
    given: number;
    received: number;
    topGivenEmoji: NameCount | null;     // name = emoji
    topReceivedEmoji: NameCount | null;
    biggestFan: NameCount | null;        // who reacts to them most
    theyStan: NameCount | null;          // who they react to most
    oneSided: { name: string; sent: number; got: number } | null;
  };
  script: {
    catchphrases: Array<{ phrase: string; count: number; ratio: number }>;
    laughs: number;
    capsShare: number;            // 0..1 share of their messages that are shouted
    profanityCount: number;
    profanityRank: number | null; // 1-based, null if they never swore
    monologue: { messageId: string; words: number; date: string; preview: string } | null;
  };
  fame: {
    mentions: number;
    mainCharacterDay: { date: string; count: number } | null;
    approval: number | null;      // 0..100, null if never mentioned with sentiment
    approvalTrend: Array<{ weekStart: string; approval: number }>; // last 8 ISO weeks with data
    supporter: { name: string; score: number; count: number } | null;
    nemesis: { name: string; score: number; count: number } | null;
    theyPraise: { name: string; score: number; count: number } | null;
    theyRoast: { name: string; score: number; count: number } | null;
  };
  persona: { label: string; blurb: string };
};

/** Every member username named in a blob's superlative fields (biggestFan,
 *  theyStan, oneSided, supporter, nemesis, theyPraise, theyRoast) — used by
 *  the API route to resolve display names + the UI to show pfps next to
 *  named superlatives. Deduplicated. */
export function superlativeUsernames(s: RecapStats): string[] {
  const names = [
    s.reactions.biggestFan?.name,
    s.reactions.theyStan?.name,
    s.reactions.oneSided?.name,
    s.fame.supporter?.name,
    s.fame.nemesis?.name,
    s.fame.theyPraise?.name,
    s.fame.theyRoast?.name,
  ].filter((n): n is string => !!n);
  return [...new Set(names)];
}
