/**
 * The fictional cast of the demo chat. Every name, nickname and backstory
 * here is invented — no real person is depicted. Hand-authored rather than
 * random so the demo reads like a show with characters: the market chart,
 * category rows and Recaps need personalities to be worth browsing.
 *
 * Traits map onto what the real pipeline measures: posting volume and hours
 * (scores, Recap clock buckets), reactiveness (reaction counts), catchphrases
 * (Recap catchphrase scoring vs the group baseline), nicknames (mention
 * resolution), and arcs (sentiment swings the market chart should show).
 */

export type Topic = 'food' | 'shows' | 'school' | 'work' | 'games' | 'music' | 'gym' | 'plans' | 'gossip' | 'astro';
export type MediaKind = 'photo' | 'video' | 'audio' | 'reel' | 'link' | 'gif';

export type CastMember = {
  id: string;
  displayName: string;
  /** Instagram re-labels ALL history with the current name at export time. */
  renamedTo?: { name: string; atDay: number };
  /** How friends refer to them. Seeded as nickname aliases (an admin does this by hand on the real chat). */
  nicknames: string[];
  /** Relative message volume. */
  activity: number;
  /** Local (America/New_York) hour this person is most active, and spread in hours. */
  peakHour: number;
  hourSpread: number;
  /** 0–1: how often they react to messages they see. */
  reactiveness: number;
  reactions: string[];
  style: { lowercase: number; emoji: number; caps: number; emojis: string[] };
  catchphrases: string[];
  topics: Topic[];
  mediaRate: number;
  media: MediaKind[];
  /** Weight multiplier for being the target of playful roasts. */
  roastability: number;
  joinDay?: number;
  leaveDay?: number;
  tagline: string;
  description: string;
};

export const CAST: CastMember[] = [
  {
    id: 'maya', displayName: 'Maya Okafor 🌙', nicknames: ['maya', 'mayo'],
    activity: 1.6, peakHour: 23, hourSpread: 2.2, reactiveness: 0.55, reactions: ['😭', '❤️', '💀'],
    style: { lowercase: 0.9, emoji: 0.35, caps: 0.06, emojis: ['😭', '🌙', '🫶'] },
    catchphrases: ['no because why is this so real', "i'm screaming", 'be so fr'],
    topics: ['shows', 'gossip', 'food', 'plans'], mediaRate: 0.05, media: ['reel', 'photo'],
    roastability: 0.8,
    tagline: 'Up at 3am. Has opinions about it.',
    description: 'The group’s resident night owl and hype machine. If a message gets sent after midnight, Maya is either replying to it or sent it.',
  },
  {
    id: 'devin', displayName: 'devin ✦', nicknames: ['devin', 'dev'],
    activity: 1.4, peakHour: 21, hourSpread: 3, reactiveness: 0.35, reactions: ['💀', '😂'],
    style: { lowercase: 1, emoji: 0.3, caps: 0.1, emojis: ['💀', '✦', '😂'] },
    catchphrases: ["it's giving", 'bro what', 'certified moment'],
    topics: ['games', 'music', 'shows', 'gossip'], mediaRate: 0.16, media: ['reel', 'gif', 'reel', 'link'],
    roastability: 1.2,
    tagline: 'Chaos, but make it a reel.',
    description: 'Sends forty reels a day and roasts everyone equally. Somehow still everyone’s favorite.',
  },
  {
    id: 'priya', displayName: 'Priya K', nicknames: ['priya', 'pk'],
    activity: 1.3, peakHour: 10, hourSpread: 3, reactiveness: 0.6, reactions: ['❤️', '👍', '😂'],
    style: { lowercase: 0.3, emoji: 0.2, caps: 0.02, emojis: ['✨', '📌', '🙏'] },
    catchphrases: ['ok team', 'quick poll', 'agenda for tonight'],
    topics: ['plans', 'school', 'work', 'food'], mediaRate: 0.04, media: ['photo', 'link'],
    roastability: 0.6,
    tagline: 'She made a spreadsheet for the group trip.',
    description: 'The organizer. Every plan that actually happened started with “ok team.”',
  },
  {
    id: 'jonah', displayName: 'Jonah Reyes', nicknames: ['jonah', 'jojo'],
    activity: 1.1, peakHour: 20, hourSpread: 2.5, reactiveness: 0.3, reactions: ['😂', '👍', '💀'],
    style: { lowercase: 0.7, emoji: 0.1, caps: 0.08, emojis: ['🏈', '😤'] },
    catchphrases: ['respectfully no', 'facts only', 'check the standings'],
    topics: ['games', 'gym', 'food', 'gossip'], mediaRate: 0.05, media: ['gif', 'link'],
    roastability: 0.9,
    tagline: 'Down 3 games in fantasy. Talking like he’s up 10.',
    description: 'Competitive about everything, especially the fantasy league he will not stop bringing up.',
  },
  {
    id: 'theo', displayName: 'theo 🏀', nicknames: ['theo', 'theodore'],
    activity: 1.0, peakHour: 19, hourSpread: 2.5, reactiveness: 0.3, reactions: ['😂', '🔥'],
    style: { lowercase: 1, emoji: 0.15, caps: 0.1, emojis: ['🏀', '🔥'] },
    catchphrases: ["and that's on the standings", 'built different', 'scoreboard'],
    topics: ['games', 'gym', 'music'], mediaRate: 0.06, media: ['gif', 'reel'],
    roastability: 0.9,
    tagline: 'Built different. His words.',
    description: 'Jonah’s rival, roommate-adjacent nemesis, and the only person who checks the standings more often than Jonah does.',
  },
  {
    id: 'sam', displayName: 'sam 🐸', nicknames: ['sam', 'sammy'],
    activity: 0.35, peakHour: 15, hourSpread: 4, reactiveness: 0.25, reactions: ['🐸', '😂'],
    style: { lowercase: 1, emoji: 0.25, caps: 0, emojis: ['🐸'] },
    catchphrases: ['anyway', 'i have returned'],
    topics: ['shows', 'music'], mediaRate: 0.12, media: ['gif', 'photo'],
    roastability: 0.5,
    tagline: 'Says one thing a week. It’s always the funniest thing that week.',
    description: 'A lurker with impeccable timing.',
  },
  {
    id: 'lena', displayName: 'Lena Fischer', nicknames: ['lena', 'len'],
    activity: 0.9, peakHour: 17, hourSpread: 3, reactiveness: 0.5, reactions: ['❤️', '😍', '🫶'],
    style: { lowercase: 0.6, emoji: 0.3, caps: 0.02, emojis: ['🎨', '🫶', '✨'] },
    catchphrases: ['obsessed', 'the vibes', 'framing this'],
    topics: ['shows', 'music', 'food', 'plans'], mediaRate: 0.18, media: ['photo', 'photo', 'video'],
    roastability: 0.4,
    tagline: 'Every photo in the group is hers.',
    description: 'Film photographer, Ines’s other half in every plan, and the reason the group trip has an album.',
  },
  {
    id: 'ines', displayName: 'ines ☕', nicknames: ['ines', 'nessie'],
    activity: 0.85, peakHour: 9, hourSpread: 3, reactiveness: 0.45, reactions: ['❤️', '😂'],
    style: { lowercase: 1, emoji: 0.2, caps: 0.02, emojis: ['☕', '🙃'] },
    catchphrases: ['coffee first', 'ugh fine', 'not before 10'],
    topics: ['work', 'food', 'shows'], mediaRate: 0.06, media: ['photo'],
    roastability: 0.5,
    tagline: 'Will not engage before coffee.',
    description: 'Morning shift barista, dry humor, inseparable from Lena.',
  },
  {
    id: 'marcus', displayName: 'Marcus Bell', nicknames: ['marcus', 'big m'],
    activity: 0.8, peakHour: 7, hourSpread: 2.5, reactiveness: 0.3, reactions: ['💪', '👍', '🔥'],
    style: { lowercase: 0.4, emoji: 0.25, caps: 0.12, emojis: ['💪', '🥩'] },
    catchphrases: ['leg day', 'hydrate', 'no excuses'],
    topics: ['gym', 'food', 'games'], mediaRate: 0.08, media: ['audio', 'audio', 'photo'],
    roastability: 0.7,
    tagline: '5am gym. Voice notes about it.',
    description: 'Sends voice notes from the squat rack. Abs talk is his love language.',
  },
  {
    id: 'ruby', displayName: 'Ruby Tran 🍓', nicknames: ['ruby', 'rubes'],
    activity: 1.2, peakHour: 22, hourSpread: 2.5, reactiveness: 0.5, reactions: ['😭', '❤️', '😮'],
    style: { lowercase: 0.8, emoji: 0.35, caps: 0.12, emojis: ['🍓', '😭', '💅'] },
    catchphrases: ['the DRAMA', "i'm literally shaking", 'spill'],
    topics: ['gossip', 'shows', 'plans'], mediaRate: 0.05, media: ['photo', 'reel'],
    roastability: 0.7,
    tagline: 'Main character energy, season-long arc.',
    description: 'Hosted the party that started the Lasagna Incident. Had the falling-out the whole chat still talks about.',
  },
  {
    id: 'chloe', displayName: 'chloe.v', nicknames: ['chloe', 'clo'],
    activity: 1.0, peakHour: 21, hourSpread: 2.5, reactiveness: 0.45, reactions: ['💅', '😂', '❤️'],
    style: { lowercase: 1, emoji: 0.25, caps: 0.08, emojis: ['💅', '🖤'] },
    catchphrases: ['not me', 'iconic', 'we move'],
    topics: ['gossip', 'shows', 'music'], mediaRate: 0.06, media: ['reel', 'photo'],
    roastability: 0.6,
    tagline: 'We move.',
    description: 'Ruby’s best friend, then not, then — eventually — again.',
  },
  {
    id: 'omar', displayName: 'Omar Haddad', nicknames: ['omar'],
    activity: 0.8, peakHour: 18, hourSpread: 3, reactiveness: 0.4, reactions: ['👍', '🙏', '❤️'],
    style: { lowercase: 0.3, emoji: 0.1, caps: 0, emojis: ['🙏'] },
    catchphrases: ["let's all relax", 'fair point', 'everyone hydrate and log off'],
    topics: ['work', 'school', 'food', 'plans'], mediaRate: 0.03, media: ['link'],
    roastability: 0.3,
    tagline: 'The adult in the room.',
    description: 'Defuses every fight, remembers every birthday, gets mentioned whenever someone needs a ride.',
  },
  {
    id: 'kenji', displayName: 'kenji 🎧', nicknames: ['kenji', 'ken'],
    activity: 0.9, peakHour: 1, hourSpread: 2.5, reactiveness: 0.3, reactions: ['🔥', '🎧'],
    style: { lowercase: 1, emoji: 0.2, caps: 0.03, emojis: ['🎧', '🔥'] },
    catchphrases: ['new track dropped', 'listen to this', 'trust the process'],
    topics: ['music', 'games', 'shows'], mediaRate: 0.15, media: ['link', 'link', 'audio'],
    roastability: 0.5,
    tagline: 'Has a playlist for this.',
    description: 'Bedroom DJ who finally played a real set this season. Shares a song link at 2am, every night.',
  },
  {
    id: 'abby', displayName: 'Abby Lindqvist', nicknames: ['abby', 'abs'],
    activity: 0.9, peakHour: 16, hourSpread: 3, reactiveness: 0.55, reactions: ['😂', '❤️', '😭'],
    style: { lowercase: 0.7, emoji: 0.3, caps: 0.05, emojis: ['🌷', '😂'] },
    catchphrases: ["wait i'm new what's happening", 'context please', 'lore drop'],
    topics: ['shows', 'school', 'food', 'gossip'], mediaRate: 0.06, media: ['photo', 'reel'],
    roastability: 0.6, joinDay: 38,
    tagline: 'Joined in April. Caught up on the lore by June.',
    description: 'Priya’s lab partner, added mid-season, now fully initiated. Asks for context on every inside joke.',
  },
  {
    id: 'felix', displayName: 'Felix Moreau', nicknames: ['felix'],
    activity: 0.6, peakHour: 13, hourSpread: 3, reactiveness: 0.2, reactions: ['👍'],
    style: { lowercase: 0.5, emoji: 0.05, caps: 0, emojis: ['👍'] },
    catchphrases: ['nice', 'sounds good'],
    topics: ['work', 'games', 'school'], mediaRate: 0.04, media: ['link'],
    roastability: 0.4, leaveDay: 150,
    tagline: 'Left the group in August. Still gets mentioned.',
    description: 'Quiet, then quieter, then gone. The chat still asks if anyone has heard from him.',
  },
  {
    id: 'zara', displayName: 'zara 💅', nicknames: ['zara'],
    activity: 1.0, peakHour: 22, hourSpread: 3, reactiveness: 0.35, reactions: ['💅', '😂', '👀'],
    style: { lowercase: 0.9, emoji: 0.3, caps: 0.1, emojis: ['💅', '👀', '♌'] },
    catchphrases: ['hot take', 'unpopular opinion', 'that is so leo of you'],
    topics: ['astro', 'gossip', 'shows', 'food'], mediaRate: 0.05, media: ['reel'],
    roastability: 0.6,
    tagline: 'Hot takes, reheated nightly.',
    description: 'Astrology, unpopular opinions, and a perfect record of starting arguments she does not finish.',
  },
  {
    id: 'danny', displayName: "Danny O'Brien", nicknames: ['danny', 'dan'],
    activity: 0.95, peakHour: 14, hourSpread: 3.5, reactiveness: 0.35, reactions: ['😂', '😅'],
    style: { lowercase: 0.8, emoji: 0.2, caps: 0.05, emojis: ['😅', '🍝'] },
    catchphrases: ["omw (i'm not)", '5 min', 'in my defense'],
    topics: ['food', 'games', 'plans'], mediaRate: 0.05, media: ['photo'],
    roastability: 2.2,
    tagline: 'Always 20 minutes late. Never near an oven again.',
    description: 'The Lasagna Incident’s lead actor. The group’s favorite person to roast, and he knows it.',
  },
  {
    id: 'hana', displayName: 'Hana Sato', nicknames: ['hana'],
    activity: 0.75, peakHour: 15, hourSpread: 3, reactiveness: 0.4, reactions: ['😂', '❤️', '📚'],
    style: { lowercase: 0.5, emoji: 0.2, caps: 0.03, emojis: ['📚', '☁️'] },
    catchphrases: ["can't, exam", 'library arc', 'one more chapter'],
    topics: ['school', 'shows', 'food'], mediaRate: 0.04, media: ['photo'],
    roastability: 0.4,
    tagline: 'Finals week took her. She came back.',
    description: 'Pre-med, perpetually in the library, resurfaces with the funniest summer of anyone.',
  },
  {
    id: 'leo', displayName: 'Leo Martins 🦁', renamedTo: { name: 'Leo Martins ⚡', atDay: 105 }, nicknames: ['leo'],
    activity: 0.9, peakHour: 20, hourSpread: 3, reactiveness: 0.4, reactions: ['🔥', '😂', '⚡'],
    style: { lowercase: 0.6, emoji: 0.3, caps: 0.1, emojis: ['⚡', '🦁', '🔥'] },
    catchphrases: ['lets gooo', 'locked in', 'new era'],
    topics: ['games', 'gym', 'music', 'astro'], mediaRate: 0.07, media: ['reel', 'photo'],
    roastability: 0.6,
    tagline: 'New name, new era. Same guy.',
    description: 'Changed his display name in July, which split him into two people in the data until the merge tool folded him back together.',
  },
  {
    id: 'bea', displayName: 'Bea', nicknames: ['bea', 'beatrice'],
    activity: 0.4, peakHour: 12, hourSpread: 4, reactiveness: 0.75, reactions: ['❤️', '😂', '🥹'],
    style: { lowercase: 0.6, emoji: 0.4, caps: 0, emojis: ['🥹', '🌼'] },
    catchphrases: ['cute', 'haha love'],
    topics: ['shows', 'food'], mediaRate: 0.05, media: ['photo'],
    roastability: 0.3,
    tagline: 'Reacts to everything. Types almost nothing.',
    description: 'The chat’s most loyal audience — a reaction on nearly every message, a text about once a week.',
  },
];

/** Background members: a real group chat is mostly lurkers. */
const LURKER_NAMES = [
  'Nico Albers', 'ava.r', 'Tomás 🌊', 'jules', 'Rina P', 'Calvin Ostrowski',
  'mo 🍵', 'Selin', 'Wes Hartley', 'Ivy',
];

export const LURKERS: CastMember[] = LURKER_NAMES.map((name, i) => ({
  id: `lurker${i + 1}`,
  displayName: name,
  nicknames: [],
  activity: 0.04 + (i % 3) * 0.02,
  peakHour: (11 + i * 5) % 24,
  hourSpread: 4,
  reactiveness: 0.08 + (i % 4) * 0.04,
  reactions: ['❤️', '😂'],
  style: { lowercase: 0.8, emoji: 0.2, caps: 0, emojis: ['🙂'] },
  catchphrases: [],
  topics: ['shows', 'food', 'plans'],
  mediaRate: 0.08,
  media: ['photo', 'reel'],
  roastability: 0.1,
  tagline: '',
  description: '',
}));

/** Closeness 0–1 between two members (symmetric). Unlisted pairs get the default. */
const CLOSENESS_DEFAULT = 0.3;
const CLOSENESS: Array<[string, string, number]> = [
  ['lena', 'ines', 0.95], ['maya', 'priya', 0.8], ['ruby', 'chloe', 0.9],
  ['jonah', 'theo', 0.75], ['devin', 'kenji', 0.7], ['marcus', 'danny', 0.65],
  ['omar', 'hana', 0.55], ['zara', 'devin', 0.55], ['maya', 'ruby', 0.6],
  ['priya', 'abby', 0.7], ['leo', 'theo', 0.55], ['leo', 'marcus', 0.5],
  ['bea', 'lena', 0.5], ['omar', 'priya', 0.55], ['zara', 'chloe', 0.5],
  ['danny', 'jonah', 0.5], ['sam', 'devin', 0.45], ['felix', 'omar', 0.45],
  ['kenji', 'maya', 0.5], ['hana', 'abby', 0.5],
];

const closenessMap = new Map<string, number>();
for (const [a, b, c] of CLOSENESS) {
  closenessMap.set(`${a}|${b}`, c);
  closenessMap.set(`${b}|${a}`, c);
}

export function baseCloseness(a: string, b: string): number {
  if (a.startsWith('lurker') || b.startsWith('lurker')) return 0.12;
  return closenessMap.get(`${a}|${b}`) ?? CLOSENESS_DEFAULT;
}

/** Display name a member carries in an export taken on `exportDay`. */
export function nameAtExport(member: CastMember, exportDay: number): string {
  return member.renamedTo && exportDay >= member.renamedTo.atDay ? member.renamedTo.name : member.displayName;
}

export function fullCast(): CastMember[] {
  return [...CAST, ...LURKERS];
}
