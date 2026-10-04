/**
 * The season's plot: dated events and relationship arcs. Day 0 is the first
 * day of the generated window. Every arc is something the real pipeline
 * should surface on its own — a sentiment dip in the market chart, a spike
 * in "Trending Now", a member drifting into "Falling Off".
 */

export type EventKind =
  | 'group_named' | 'birthday' | 'member_added' | 'lasagna' | 'rivalry_climax'
  | 'fight' | 'reconcile' | 'finals' | 'finals_over' | 'trip' | 'member_left'
  | 'dj_set' | 'finale_party' | 'watch_night';

export type StoryEvent = {
  kind: EventKind;
  day: number;
  /** Cast ids at the center of the event. */
  subjects: string[];
  /** Multiplier on the day's conversation volume. */
  volume: number;
};

export const STORY: StoryEvent[] = [
  { kind: 'group_named', day: 4, subjects: ['priya'], volume: 1.1 },
  { kind: 'birthday', day: 19, subjects: ['priya'], volume: 2.2 },
  { kind: 'member_added', day: 38, subjects: ['priya', 'abby'], volume: 1.4 },
  { kind: 'lasagna', day: 54, subjects: ['danny', 'ruby'], volume: 2.6 },
  { kind: 'rivalry_climax', day: 84, subjects: ['jonah', 'theo'], volume: 1.8 },
  { kind: 'fight', day: 75, subjects: ['ruby', 'chloe'], volume: 2.4 },
  { kind: 'finals', day: 112, subjects: ['hana'], volume: 1.0 },
  { kind: 'finals_over', day: 119, subjects: ['hana'], volume: 1.5 },
  { kind: 'trip', day: 126, subjects: ['lena', 'priya'], volume: 2.8 },
  { kind: 'trip', day: 127, subjects: ['lena', 'priya'], volume: 3.0 },
  { kind: 'trip', day: 128, subjects: ['lena', 'priya'], volume: 2.2 },
  { kind: 'reconcile', day: 140, subjects: ['ruby', 'chloe'], volume: 2.0 },
  { kind: 'member_left', day: 150, subjects: ['felix'], volume: 1.3 },
  { kind: 'dj_set', day: 160, subjects: ['kenji'], volume: 2.0 },
  { kind: 'finale_party', day: 175, subjects: ['maya', 'devin'], volume: 2.6 },
];

/** Sunday-night watch party: a small weekly bump on top of the plot. */
export function eventsOn(day: number, weekday: number): StoryEvent[] {
  const evs = STORY.filter(e => e.day === day);
  if (weekday === 0) evs.push({ kind: 'watch_night', day, subjects: [], volume: 1.25 });
  return evs;
}

export const RIVALRY = { a: 'jonah', b: 'theo', from: 63, to: 98 };
export const FALLOUT = { a: 'ruby', b: 'chloe', from: 75, to: 139 };
export const FINALS = { member: 'hana', from: 112, to: 118 };
export const LASAGNA_DAY = 54;

export type Relationship = 'neutral' | 'close' | 'rivals' | 'fallout' | 'reconciled';

export function relationship(a: string, b: string, day: number, closeness: number): Relationship {
  const pair = (x: { a: string; b: string }) => (a === x.a && b === x.b) || (a === x.b && b === x.a);
  if (pair(FALLOUT) && day >= FALLOUT.from && day <= FALLOUT.to) return 'fallout';
  if (pair(FALLOUT) && day > FALLOUT.to) return 'reconciled';
  if (pair(RIVALRY) && day >= RIVALRY.from && day <= RIVALRY.to) return 'rivals';
  return closeness >= 0.6 ? 'close' : 'neutral';
}

/** Per-member, per-day activity multiplier from the arcs. */
export function activityFactor(id: string, day: number, joinDay?: number, leaveDay?: number): number {
  if (joinDay !== undefined && day < joinDay) return 0;
  if (leaveDay !== undefined && day >= leaveDay) return 0;
  let f = 1;
  // a new member ramps in over their first month
  if (joinDay !== undefined) f *= Math.min(1, 0.35 + (day - joinDay) / 30);
  // a member who is about to leave fades out first
  if (leaveDay !== undefined && day > leaveDay - 50) f *= Math.max(0.15, (leaveDay - day) / 50);
  if (id === FINALS.member && day >= FINALS.from && day <= FINALS.to) f *= 0.12;
  if ((id === FALLOUT.a || id === FALLOUT.b) && day > FALLOUT.from && day < FALLOUT.from + 21) f *= 0.7;
  if (id === 'kenji' && day >= 150 && day <= 165) f *= 1.4;
  if (id === 'abby' && day > 120) f *= 1.25;
  return f;
}

/** Closeness modifier: the fallout pair stops talking to each other. */
export function closenessOn(a: string, b: string, day: number, base: number): number {
  const rel = relationship(a, b, day, base);
  if (rel === 'fallout') return day === FALLOUT.from ? 1 : 0.04;
  if (rel === 'rivals') return Math.max(base, 0.85);
  return base;
}
