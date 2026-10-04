import { Rng } from './rng';
import { fullCast, baseCloseness, nameAtExport, type CastMember, type MediaKind, type Topic } from './cast';
import { eventsOn, relationship, activityFactor, closenessOn, RIVALRY, FALLOUT, LASAGNA_DAY, type StoryEvent, type Relationship } from './storyline';
import * as T from './text';

/**
 * The simulation: a day-by-day model of a friend-group chat. Each day has a
 * Poisson number of conversations; each conversation has an initiator (picked
 * by activity and time of day), a few participants (picked by closeness), and
 * a run of messages with heavy-tailed gaps and double-texting. Mentions,
 * reactions and media follow per-member traits and the storyline's arcs.
 *
 * Output is chronological, platform-neutral, and carries ground truth (who
 * each message was about and with what intent) — export.ts renders it as an
 * Instagram archive, eval.ts scores the real pipeline against it.
 */

export type SynthIntent = { targetId: string; alias: string; intent: T.Intent };

export type SynthMessage = {
  senderId: string;
  ts: number;
  content: string;
  media: { kind: MediaKind; uri: string } | null;
  system: boolean;
  reactions: Array<{ actorId: string; emoji: string }>;
  intents: SynthIntent[];
};

export type SynthOptions = {
  seed: number;
  /** First day, YYYY-MM-DD (local America/New_York). */
  start: string;
  days: number;
  /** Mean conversations on an ordinary day. */
  sessionsPerDay: number;
  chatName: string;
};

export type SynthExport = { day: number; date: string };

export type SynthChat = {
  options: SynthOptions;
  cast: CastMember[];
  messages: SynthMessage[];
  /** One archive per entry; each covers day 0..day. Two exports straddling a rename reproduce name drift. */
  exports: SynthExport[];
};

export const DEFAULT_OPTIONS: SynthOptions = {
  seed: 20260330, start: '2026-03-30', days: 182, sessionsPerDay: 15, chatName: 'Binge Club 🍿',
};

// --- time ----------------------------------------------------------------

const NY_PARTS = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/New_York', hourCycle: 'h23',
  year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
});

/** Minutes America/New_York is offset from UTC at an instant (EDT → -240). */
function nyOffsetMinutes(utcMs: number): number {
  const parts = NY_PARTS.formatToParts(new Date(utcMs));
  const get = (t: string) => Number(parts.find(p => p.type === t)!.value);
  const wall = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
  return Math.round((wall - utcMs) / 60000);
}

/** UTC ms of local midnight for `start + day`. */
export function localMidnightUtc(start: string, day: number): number {
  const [y, m, d] = start.split('-').map(Number) as [number, number, number];
  const noonUtc = Date.UTC(y, m - 1, d + day, 12);
  const offset = nyOffsetMinutes(noonUtc);
  return Date.UTC(y, m - 1, d + day) - offset * 60000;
}

export function dateOf(start: string, day: number): string {
  const [y, m, d] = start.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d + day)).toISOString().slice(0, 10);
}

function weekdayOf(start: string, day: number): number {
  const [y, m, d] = start.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d + day)).getUTCDay();
}

// --- model ---------------------------------------------------------------

const WEEKDAY_VOLUME = [1.15, 0.9, 0.95, 1, 1.05, 1.2, 1.25]; // Sun..Sat

const INTENT_MIX: Record<Relationship, Record<T.Intent, number>> = {
  neutral:    { praise: 0.26, roast: 0.30, logistics: 0.36, sarcastic: 0.05, hostile: 0.03 },
  close:      { praise: 0.38, roast: 0.32, logistics: 0.27, sarcastic: 0.02, hostile: 0.01 },
  rivals:     { praise: 0.04, roast: 0.38, logistics: 0.10, sarcastic: 0.26, hostile: 0.22 },
  fallout:    { praise: 0.02, roast: 0.03, logistics: 0.05, sarcastic: 0.30, hostile: 0.60 },
  reconciled: { praise: 0.50, roast: 0.25, logistics: 0.23, sarcastic: 0.01, hostile: 0.01 },
};

const INTENTS: T.Intent[] = ['praise', 'roast', 'logistics', 'sarcastic', 'hostile'];

function hourWeight(m: CastMember, hour: number): number {
  const raw = Math.abs(hour - m.peakHour);
  const d = Math.min(raw, 24 - raw);
  return Math.exp(-(d * d) / (2 * m.hourSpread * m.hourSpread)) + 0.04;
}

class Simulator {
  private readonly cast: CastMember[];
  private readonly byId: Map<string, CastMember>;
  private readonly messages: SynthMessage[] = [];
  private readonly usedKeys = new Set<string>();
  private mediaSeq = 0;

  constructor(private readonly rng: Rng, private readonly opts: SynthOptions) {
    this.cast = fullCast();
    this.byId = new Map(this.cast.map(m => [m.id, m]));
  }

  private member(id: string): CastMember {
    const m = this.byId.get(id);
    if (!m) throw new Error(`unknown cast id ${id}`);
    return m;
  }

  private factor(m: CastMember, day: number): number {
    return activityFactor(m.id, day, m.joinDay, m.leaveDay);
  }

  private closeness(a: string, b: string, day: number): number {
    return closenessOn(a, b, day, baseCloseness(a, b));
  }

  /** Name others would type — always the *current* display name's form. */
  private alias(target: CastMember, day: number): string {
    return T.pickAlias(this.rng, target, nameAtExport(target, day));
  }

  private push(msg: Omit<SynthMessage, 'ts'> & { ts: number }): void {
    let ts = msg.ts;
    // dedup ids hash (sender, ts, content): never emit an accidental duplicate
    while (this.usedKeys.has(`${msg.senderId}:${ts}`)) ts += 1;
    this.usedKeys.add(`${msg.senderId}:${ts}`);
    this.messages.push({ ...msg, ts });
  }

  run(): SynthChat {
    for (let day = 0; day < this.opts.days; day++) this.simulateDay(day);
    this.messages.sort((a, b) => a.ts - b.ts);
    const exports: SynthExport[] = [];
    const renameDay = this.cast.find(m => m.renamedTo)?.renamedTo?.atDay;
    if (renameDay !== undefined && renameDay > 0 && renameDay < this.opts.days) {
      exports.push({ day: renameDay - 1, date: dateOf(this.opts.start, renameDay - 1) });
    }
    exports.push({ day: this.opts.days - 1, date: dateOf(this.opts.start, this.opts.days - 1) });
    return { options: this.opts, cast: this.cast, messages: this.messages, exports };
  }

  private simulateDay(day: number): void {
    const weekday = weekdayOf(this.opts.start, day);
    const events = eventsOn(day, weekday);
    const midnight = localMidnightUtc(this.opts.start, day);
    const active = this.cast.filter(m => this.factor(m, day) > 0);
    if (active.length < 2) return;

    this.systemEvents(day, events, midnight);

    const volume = WEEKDAY_VOLUME[weekday]! * events.reduce((v, e) => v * e.volume, 1);
    const sessions = this.rng.poisson(this.opts.sessionsPerDay * volume);
    for (let s = 0; s < sessions; s++) this.simulateSession(day, midnight, active, events);
  }

  private systemEvents(day: number, events: StoryEvent[], midnight: number): void {
    for (const e of events) {
      const at = midnight + (11 + this.rng.int(0, 8)) * 3600_000 + this.rng.int(0, 3599_999);
      const sys = (senderId: string, content: string) =>
        this.push({ senderId, ts: at, content, media: null, system: true, reactions: [], intents: [] });
      if (e.kind === 'group_named') sys('priya', `${this.member('priya').displayName} named the group ${this.opts.chatName}.`);
      if (e.kind === 'member_added') sys('priya', `${this.member('priya').displayName} added ${this.member('abby').displayName} to the group.`);
      if (e.kind === 'member_left') sys('felix', `${this.member('felix').displayName} left the group.`);
    }
  }

  private simulateSession(day: number, midnight: number, active: CastMember[], events: StoryEvent[]): void {
    const rng = this.rng;
    const subjects = events.flatMap(e => e.subjects).filter(id => active.some(a => a.id === id));
    // event days: most conversations involve the people the event is about
    const forced = subjects.length && rng.chance(0.6) ? this.member(rng.pick(subjects)) : null;

    const initiator = forced ?? rng.weighted(active, m => m.activity * this.factor(m, day));
    let hour = Math.round(rng.normal(initiator.peakHour, initiator.hourSpread));
    hour = ((hour % 24) + 24) % 24;
    let ts = midnight + hour * 3600_000 + rng.int(0, 3599_999);

    const others = active.filter(m => m.id !== initiator.id);
    const k = Math.min(others.length, 1 + rng.poisson(2.2));
    const participants: CastMember[] = [initiator];
    const pool = [...others];
    for (let i = 0; i < k && pool.length; i++) {
      const p = rng.weighted(pool, m =>
        m.activity * this.factor(m, day) * hourWeight(m, hour) * (0.15 + this.closeness(initiator.id, m.id, day)));
      participants.push(p);
      pool.splice(pool.indexOf(p), 1);
    }
    for (const id of subjects) {
      if (rng.chance(0.7) && !participants.some(p => p.id === id)) participants.push(this.member(id));
    }

    const eventKeys = events.map(e => e.kind as string);
    const topic: Topic = eventKeys.map(T.eventTopic).find(Boolean) && rng.chance(0.5)
      ? eventKeys.map(T.eventTopic).find(Boolean)!
      : rng.pick(initiator.topics);

    const isEventDay = events.some(e => e.kind !== 'watch_night');
    const length = 3 + rng.poisson(isEventDay ? 15 : 10);
    let speaker = initiator;
    for (let i = 0; i < length; i++) {
      if (i > 0) {
        if (!rng.chance(0.28) || participants.length === 1) {
          const prev = speaker;
          const candidates = participants.filter(p => p.id !== prev.id);
          speaker = rng.weighted(candidates, p => p.activity * (0.2 + this.closeness(prev.id, p.id, day)));
        }
        // heavy-tailed gaps: mostly seconds, sometimes a long pause
        ts += Math.round(rng.chance(0.06) ? rng.int(5, 90) * 60_000 : rng.logNormal(35_000, 1.1));
      }
      const msg = this.compose(speaker, participants, day, topic, events);
      this.push({ ...msg, ts, reactions: this.react(msg, speaker, participants, day) });
    }
  }

  private pickIntent(speaker: CastMember, target: CastMember, day: number): T.Intent {
    const rel = relationship(speaker.id, target.id, day, baseCloseness(speaker.id, target.id));
    const mix = INTENT_MIX[rel];
    return this.rng.weighted(INTENTS, i => mix[i] * (i === 'roast' ? target.roastability : 1));
  }

  private compose(speaker: CastMember, participants: CastMember[], day: number, topic: Topic, events: StoryEvent[]):
    Omit<SynthMessage, 'ts' | 'reactions'> {
    const rng = this.rng;
    const base = { senderId: speaker.id, media: null, system: false, intents: [] as SynthIntent[] };
    const others = participants.filter(p => p.id !== speaker.id);

    // media
    if (rng.chance(speaker.mediaRate)) {
      const kind = rng.pick(speaker.media);
      const media = { kind, uri: this.mediaUri(kind) };
      if (kind === 'reel' && others.length && rng.chance(0.25)) {
        const t = rng.pick(others);
        const c = T.mentionReel(rng, speaker, t, this.alias(t, day));
        return { ...base, media, content: c.text, intents: c.intents };
      }
      return { ...base, media, content: T.mediaCaption(rng, kind) };
    }

    // storyline content
    for (const e of events) {
      if (e.kind === 'watch_night') {
        if (rng.chance(0.08)) {
          const line = T.eventPlain(rng, speaker, 'watch_night');
          if (line) return { ...base, content: line };
        }
        continue;
      }
      if (!rng.chance(0.4)) continue;
      const subjects = e.subjects.map(id => this.member(id)).filter(m => m.id !== speaker.id);
      const isSubject = e.subjects.includes(speaker.id);
      let key: string = e.kind;
      if (e.kind === 'fight') {
        const pair = [FALLOUT.a, FALLOUT.b];
        if (pair.includes(speaker.id)) {
          const other = this.member(pair.find(id => id !== speaker.id)!);
          const c = T.eventMention(rng, speaker, 'fight', other, this.alias(other, day));
          if (c) return { ...base, content: c.text, intents: c.intents };
        }
        key = 'fight_bystander';
      }
      if (e.kind === 'reconcile') {
        const pair = [FALLOUT.a, FALLOUT.b];
        if (pair.includes(speaker.id)) {
          const other = this.member(pair.find(id => id !== speaker.id)!);
          const c = T.eventMention(rng, speaker, 'reconcile', other, this.alias(other, day));
          if (c) return { ...base, content: c.text, intents: c.intents };
        }
        key = 'reconcile_bystander';
      }
      const target = e.kind === 'lasagna' ? this.member('danny') : subjects.length ? rng.pick(subjects) : null;
      if (target && target.id !== speaker.id && (!isSubject || e.kind === 'trip') && rng.chance(0.6)) {
        const c = T.eventMention(rng, speaker, key, target, this.alias(target, day));
        if (c) return { ...base, content: c.text, intents: c.intents };
      }
      const plain = T.eventPlain(rng, speaker, e.kind);
      if (plain) return { ...base, content: plain };
    }

    // ongoing arcs
    if (day > LASAGNA_DAY && rng.chance(0.006 * Math.exp(-(day - LASAGNA_DAY) / 60))) {
      if (speaker.id !== 'danny' && rng.chance(0.5)) {
        const danny = this.member('danny');
        const c = T.eventMention(rng, speaker, 'lasagna_lore', danny, this.alias(danny, day));
        if (c) return { ...base, content: c.text, intents: c.intents };
      }
      const plain = T.eventPlain(rng, speaker, 'lasagna_lore');
      if (plain) return { ...base, content: plain };
    }
    const inRivalry = day >= RIVALRY.from && day <= RIVALRY.to;
    if (inRivalry && (speaker.id === RIVALRY.a || speaker.id === RIVALRY.b) && rng.chance(0.2)) {
      const rival = this.member(speaker.id === RIVALRY.a ? RIVALRY.b : RIVALRY.a);
      const key = day === 84 ? 'rivalry_climax' : 'rivalry';
      const c = rng.chance(0.75) ? T.eventMention(rng, speaker, key, rival, this.alias(rival, day)) : null;
      if (c) return { ...base, content: c.text, intents: c.intents };
      const plain = T.eventPlain(rng, speaker, 'rivalry');
      if (plain) return { ...base, content: plain };
    }

    // ordinary mentions: usually someone in the conversation, sometimes an absent friend
    if (rng.chance(0.13)) {
      const everyone = this.cast.filter(m =>
        m.id !== speaker.id && !m.id.startsWith('lurker') && (m.joinDay === undefined || day >= m.joinDay));
      const target = rng.weighted(everyone, m =>
        (others.includes(m) ? 2.5 : 0.6) * (0.1 + this.closeness(speaker.id, m.id, day)) * (0.6 + m.roastability * 0.4)
        * (m.leaveDay !== undefined && day >= m.leaveDay ? 0.15 : 1));
      if (rng.chance(0.04)) {
        const second = rng.pick(everyone.filter(m => m.id !== target.id));
        const c = T.comparison(rng, speaker, target, this.alias(target, day), second, this.alias(second, day));
        return { ...base, content: c.text, intents: c.intents };
      }
      const c = T.mention(rng, speaker, target, this.alias(target, day), this.pickIntent(speaker, target, day));
      return { ...base, content: c.text, intents: c.intents };
    }

    return { ...base, content: T.generic(rng, speaker, topic) };
  }

  private react(msg: Omit<SynthMessage, 'ts' | 'reactions'>, speaker: CastMember, participants: CastMember[], day: number):
    SynthMessage['reactions'] {
    const rng = this.rng;
    const laugh = /lmao|lmfao|haha|💀|😂|😭|wheez/i.test(msg.content);
    const intents = msg.intents.map(i => i.intent);
    const boost = (msg.media ? 1.5 : 1) * (laugh ? 1.6 : 1)
      * (intents.includes('roast') ? 1.5 : intents.includes('praise') ? 1.3 : 1)
      * (intents.includes('hostile') ? 0.5 : 1) * (msg.content.length < 6 && !msg.media ? 0.5 : 1);
    const out: SynthMessage['reactions'] = [];
    for (const p of participants) {
      if (p.id === speaker.id) continue;
      const c = this.closeness(speaker.id, p.id, day);
      if (!rng.chance(Math.min(0.9, 0.55 * p.reactiveness * boost * (0.5 + c)))) continue;
      const emoji = laugh || intents.includes('roast') ? rng.pick(['😂', '💀', '😭', ...p.reactions])
        : intents.includes('praise') ? rng.pick(['❤️', '🔥', '🥹', ...p.reactions])
        : rng.pick(p.reactions);
      out.push({ actorId: p.id, emoji });
    }
    return out;
  }

  private mediaUri(kind: MediaKind): string {
    const id = (++this.mediaSeq).toString(36).padStart(6, '0');
    switch (kind) {
      case 'photo': return `your_instagram_activity/messages/inbox/bingeclub_1048576/photos/${id}.jpg`;
      case 'video': return `your_instagram_activity/messages/inbox/bingeclub_1048576/videos/${id}.mp4`;
      case 'audio': return `your_instagram_activity/messages/inbox/bingeclub_1048576/audio/${id}.mp4`;
      case 'reel': return `https://www.instagram.com/reel/C${id}xDemo/`;
      case 'gif': return `https://media.giphy.com/media/demo${id}/giphy.gif`;
      case 'link': return this.rng.chance(0.7) ? `https://open.spotify.com/track/demo${id}` : `https://example.com/article/${id}`;
    }
  }
}

export function simulate(options: Partial<SynthOptions> = {}): SynthChat {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  return new Simulator(new Rng(opts.seed), opts).run();
}
