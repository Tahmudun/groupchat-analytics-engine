export type PersonaInputs = {
  volume: number;         // total messages percentile
  nightOwl: number;       // share of messages 00:00–05:59 percentile
  givenPerMsg: number;    // reactions given per message percentile
  receivedPerMsg: number; // reactions received per message percentile
  sentimentGiven: number; // mean sentiment they express percentile
  approval: number;       // mean sentiment received percentile
  mentions: number;       // times mentioned percentile
  laughShare: number;     // share of their messages that are laughs percentile
  capsShare: number;      // share of their messages SHOUTED (all-caps) percentile
  profanityPerMsg: number; // curse words per message percentile
};

/** Percentile = share of OTHER members strictly below. One member → 0.5.
 *  Tied values share one percentile (count of strictly-smaller values / (n-1))
 *  rather than being split apart by insertion order — the underlying rows
 *  arrive in nondeterministic SQL GROUP BY order, so untied ties would make
 *  persona classification flip between runs on identical data. */
export function percentileMap(values: Map<string, number>): Map<string, number> {
  const entries = [...values.entries()];
  const n = entries.length;
  const out = new Map<string, number>();
  if (n === 0) return out;
  if (n === 1) return out.set(entries[0]![0], 0.5);
  const sorted = entries.map(([, v]) => v).sort((a, b) => a - b);
  for (const [k, v] of entries) {
    // Binary search for the count of values strictly less than v (lower bound).
    let lo = 0, hi = sorted.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (sorted[mid]! < v) lo = mid + 1; else hi = mid;
    }
    out.set(k, lo / (n - 1));
  }
  return out;
}

// Ordered: rarest/funniest first, first match wins, guaranteed fallback.
// Thresholds are percentiles; copy is tunable, mechanism is the contract.
// The rare genres sit ABOVE Sitcom Lead on purpose — they get first claim on
// members who would otherwise all collapse into the loud-and-liked bucket.
const RULES: Array<{ label: string; blurb: string; test: (p: PersonaInputs) => boolean }> = [
  { label: 'Reality TV Villain', blurb: 'Everyone talks about them. Rarely kindly. They started it.',
    test: p => p.sentimentGiven <= 0.2 && p.mentions >= 0.6 },
  { label: 'Psychological Thriller', blurb: 'Barely speaks. Somehow always the plot.',
    test: p => p.volume <= 0.35 && p.mentions >= 0.7 },
  { label: 'Antihero', blurb: 'Roasts everyone. Beloved anyway. The writers know exactly what they\'re doing.',
    test: p => p.sentimentGiven <= 0.3 && p.approval >= 0.7 },
  { label: 'Action Blockbuster', blurb: 'EVERY LINE DELIVERED LIKE A TRAILER MOMENT.',
    test: p => p.capsShare >= 0.85 && p.volume >= 0.4 },
  { label: 'Late-Night Talk Show', blurb: 'Peak broadcast hours: 2am. Somehow always live.',
    test: p => p.nightOwl >= 0.75 && p.volume >= 0.6 },
  { label: 'Rom-Com Lead', blurb: 'Radiates warmth in every scene. The chat swoons back.',
    test: p => p.sentimentGiven >= 0.8 && p.approval >= 0.6 },
  { label: 'Live Studio Audience', blurb: 'Laughing at every scene. The energy the whole show runs on.',
    test: p => p.laughShare >= 0.8 && p.givenPerMsg >= 0.6 },
  { label: 'Mockumentary', blurb: 'Profane, hilarious, and fully aware of the camera.',
    test: p => p.profanityPerMsg >= 0.85 && p.laughShare >= 0.6 },
  { label: 'Sitcom Lead', blurb: 'High volume, high approval. The show is about them and everyone is fine with it.',
    test: p => p.volume >= 0.75 && p.approval >= 0.6 },
  { label: 'Critically Acclaimed, Barely Watched', blurb: 'Rarely posts. When they do, the chat loves it.',
    test: p => p.approval >= 0.75 && p.volume <= 0.35 },
  { label: 'Background Extra', blurb: 'Technically in every scene. Zero lines.',
    test: p => p.volume <= 0.2 && p.mentions <= 0.2 },
  { label: 'The Narrator', blurb: 'Provides constant commentary. Reacts to nothing.',
    test: p => p.volume >= 0.7 && p.givenPerMsg <= 0.25 },
  { label: 'Fan Favorite', blurb: 'Every episode gets a standing ovation.',
    test: p => p.receivedPerMsg >= 0.75 },
];

export function classifyPersona(p: PersonaInputs): { label: string; blurb: string } {
  for (const r of RULES) if (r.test(p)) return { label: r.label, blurb: r.blurb };
  return { label: 'Cult Classic', blurb: 'Hard to categorize. The people who get it, get it.' };
}
