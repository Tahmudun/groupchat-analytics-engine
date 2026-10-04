import type { Rng } from './rng';
import type { CastMember, Topic } from './cast';

/**
 * Message text for the synthetic chat. Templates are filled from slot banks
 * and then run through the sender's texting style, so the same template reads
 * differently from different people.
 *
 * Mention templates carry an Intent — the ground truth the sentiment eval
 * scores the real classifier against. The intents follow the classifier's own
 * rubric (lib/sentiment/contract.ts): genuine praise is positive, affectionate
 * roasting is roughly neutral, real hostility and sarcasm are negative.
 */

export type Intent = 'praise' | 'roast' | 'logistics' | 'sarcastic' | 'hostile';

export const INTENT_LABEL: Record<Intent, 'positive' | 'neutral' | 'negative'> = {
  praise: 'positive', roast: 'neutral', logistics: 'neutral', sarcastic: 'negative', hostile: 'negative',
};
/** What a perfect classifier would score (used only by the dev-only oracle). */
export const INTENT_SCORE: Record<Intent, number> = {
  praise: 0.7, roast: 0.05, logistics: 0, sarcastic: -0.4, hostile: -0.7,
};

const SLOTS: Record<string, string[]> = {
  food: ['tacos', 'ramen', 'pizza', 'boba', 'wings', 'pho', 'bagels', 'dumplings', 'the halal cart', 'sushi', 'birria', 'pancakes', 'hot pot', 'empanadas', 'a chopped cheese'],
  show: ['Midnight Harbor', 'The Glass Orchard', 'Love on Layover', 'Station Nine', 'Crown of Ash', 'Dead Air', 'Baking Under Pressure', 'Ghost Lights', 'The Summit House', 'Low Tide'],
  place: ['the diner', 'the park', 'the library', "trader joe's", 'the roof', 'campus', 'the pier', 'the bodega', 'the arcade', 'the night market'],
  time: ['tonight', 'tmrw', 'later', 'at 8', 'after class', 'this weekend', 'friday', 'after work', 'at 9:30', 'sunday'],
  game: ['ranked', 'mario kart', 'smash', 'trivia night', 'chess', 'the fantasy draft', 'pickup', 'bowling'],
  favor: ['the ride home', 'saving me a seat', 'the snacks', 'covering my shift', 'the notes', 'the aux', 'picking up the food'],
  excuse: ['work', 'i have a quiz', 'family dinner', "i'm dead tired", 'laundry emergency', 'i have a shift', 'my sister is visiting'],
  class: ['bio', 'stats', 'orgo', 'econ', 'the seminar', 'data structures', 'art history'],
  num: ['2', '3', '4', '5', '10', '20', '45'],
};

const TOPIC_LINES: Record<Topic, string[]> = {
  food: [
    'who wants {food}', '{food} run anyone?', 'ok but {food} at 2am hits different',
    'the {food} place by {place} is closed?? 😭', "i've had {food} three days in a row and i regret nothing",
    'is it a {food} night or a {food} night', "i'm so hungry i would fight someone for {food}",
    'rating {food} spots is my new personality', 'they gave me extra mayo and honestly that ruined my day',
    'i tried making {food} and the smoke alarm went off', 'whoever recommended that {food} place thank you',
    'we need a group {food} night', 'what is everyone eating', 'i just spent {num} dollars on {food} help',
  ],
  shows: [
    'has anyone started {show}', 'episode {num} of {show} ruined me', 'no spoilers for {show} i beg',
    '{show} is so underrated', "i'm on season {num} of {show} and i can't stop", 'who wants to watch {show} {time}',
    'the {show} finale was robbery', '{show} or {show}? pick one', 'i fell asleep during {show} again',
    'the soundtrack in {show} goes so hard', 'rewatching {show} for the {num}th time', 'is {show} worth it or nah',
  ],
  school: [
    'did anyone do the {class} reading', 'the {class} exam was a crime', "i haven't slept since the {class} midterm",
    'who has the {class} notes', '{class} lecture was 2 hours of nothing', 'study session at {place} {time}?',
    'the {class} prof curved it!!', 'i have {num} assignments due and zero motivation', 'group project trauma unlocked',
  ],
  work: [
    'my manager scheduled a meeting about meetings', 'closing shift again 🫠', 'the dev server is down again so i guess i’m free',
    'i got the {num} hour shift', 'payday tomorrow and i already spent it', 'work was actually chill today',
    'someone take my shift {time} please', 'customer just asked me if we sell {food}', 'quiet quitting starts now',
  ],
  games: [
    'who is on {game} {time}', 'i went 0 for {num} in {game} and i want to uninstall', '{game} rematch when',
    'i am unbeatable at {game} this is not a debate', 'the {game} bracket is up', 'need one more for {game}',
    'i rage quit {game} so fast', 'carried the whole {game} lobby not to brag', '{game} at {place} {time}?',
  ],
  music: [
    'this song has been on repeat for {num} hours', 'who has concert tickets', 'new album dropped and it’s a 10',
    'aux is mine on the next ride', 'my wrapped is going to be embarrassing', 'drop your current song',
    'saw them live and i’m still not okay', 'this playlist is perfect for {place}',
  ],
  gym: [
    'leg day destroyed me', 'my abs are sore from laughing at this chat', 'who wants to hit the gym {time}',
    'new pr today 💪', 'skipped the gym for {food} no regrets', 'abs day tomorrow, pray for me',
    'the gym was packed at 6am??', 'stretching is a lie', 'protein shake for dinner again',
  ],
  plans: [
    '{place} {time}?', "i'm down", 'who is coming {time}', 'running {num} min late', 'omw',
    'should we do {place} or {place}', 'can’t {time}, {excuse}', 'what are we doing {time}', 'bet see you there',
    'someone make a plan i’ll show up', 'is the {time} thing still happening', 'i can drive {time}',
  ],
  gossip: [
    'wait did you guys hear', 'ok i have tea', 'i saw something at {place} and i cannot say', 'spill it',
    'the group chat is not ready for this', 'no because who told them', 'this is the most dramatic week',
    'i need a summary of the last 200 messages', 'sorry what happened while i was asleep',
  ],
  astro: [
    'mercury is in retrograde that explains everything', 'that is such a leo move', 'leo season was chaos',
    'big three check, go', 'water signs please stay calm', 'this is the most gemini thing i have ever seen',
  ],
};

const BANTER = [
  'fr', 'no literally', 'real', 'LMAOOO', '💀💀💀', "i'm crying", 'not this again', 'be so fr', 'the way i screamed',
  'yeah', 'same', 'nah', 'wait what', 'ok?', 'LMFAO', 'stoppp', 'this is so true', "i can't with you guys",
  'brb', 'lol', 'true', "ok that's fair", 'hold on', 'nooo', 'W', 'huge L', 'valid', 'say less', 'bet', "i'm dead",
  'HELP', '😭😭', 'why is this so accurate', 'who asked 😂', 'agreed', 'exactly', 'and?', "i'm weak", 'period',
  'wait that’s actually funny', 'ok calm down', 'goodnight losers', 'good morning chat', 'why is everyone awake',
  'whatttt', 'pause', 'no way', 'the accuracy', 'i felt that', 'LMAO what', 'iconic', 'so real', 'can confirm',
];

const LAUGHS = ['LMAOOO', '😂😂', 'HAHAHA', '💀', 'lmao', 'LMFAOOO', 'i’m wheezing', '😭😭😭'];

type MentionTemplate = { t: string; intent: Intent };

const MENTION: Record<Intent, string[]> = {
  praise: [
    '{n} is literally the best', 'ok {n} carried tonight fr', '{n} you’re so real for that', 'love {n} sm 🥹',
    '{n} never misses 🔥', 'shoutout {n} for {favor}', '{n} is the funniest person i know', '{n} came through for real',
    'proud of {n} ngl', '{n} you’re actually so talented', '{n} gave the best advice today',
    'everyone say thank you {n} 🙏', '{n} is a genuinely good person', 'protect {n} at all costs',
    '{n} with the save', 'nobody does it like {n}',
  ],
  roast: [
    '{n} is so washed 💀', '{n} what is this outfit lmaooo', 'not {n} being late AGAIN 😭',
    '{n} you have the music taste of a dentist office', '{n} really said that with confidence 💀',
    "someone take {n}'s phone away", '{n} is the reason we have rules', "{n} you're actually insane lmao",
    '{n} fell for it again 😂', '{n} cooking? we’re doomed', '{n} has never been right about anything lol',
    '{n} typing for 5 minutes to send "ok" 💀', '{n} you’re a menace', 'this is so {n} coded 😭',
  ],
  logistics: [
    '{n} are you coming {time}', 'did {n} send the link', '{n} what time', 'has anyone heard from {n}',
    '{n} can you bring the speaker', 'waiting on {n}', '{n} check the doc', 'ask {n}, they know',
    '{n} where are you', '{n} did you get home ok', '{n} venmo me for {food}', "{n} what's the address",
    '{n} are we still on for {place}', 'is {n} driving or am i', '{n} you have my charger',
  ],
  sarcastic: [
    'wow {n} really outdid themselves 🙄', 'great job {n}, truly iconic behavior', '{n} the genius strikes again',
    'thanks {n}, so helpful 🙄', 'oh wow {n} finally showed up, what an honor', '{n} you’re SO funny 🙄',
    'cool story {n}', 'amazing plan {n}, really', '{n} as usual, a pillar of reliability 🙄',
  ],
  hostile: [
    '{n} i’m actually so done with you', '{n} that was genuinely so rude', 'honestly {n} you need to stop',
    '{n} you always do this', 'not talking to {n} rn', '{n} you know exactly what you did', '{n} stop lying',
    "i'm so over {n}'s attitude", '{n} that’s low even for you', '{n} leave me alone',
  ],
};

/** Arc-specific lines; {n} is the event subject unless noted. */
const EVENT_LINES: Record<string, MentionTemplate[]> = {
  birthday: [
    { t: 'HAPPY BIRTHDAY {n} 🎂🎉', intent: 'praise' }, { t: 'happy bday {n}!!! love you', intent: 'praise' },
    { t: '{n} another year of carrying this group', intent: 'praise' }, { t: 'birthday legend {n} 🥳', intent: 'praise' },
    { t: '{n} what do you want for your birthday dinner', intent: 'logistics' }, { t: '{n} is officially ancient 💀', intent: 'roast' },
  ],
  member_added: [
    { t: 'welcome {n}!!', intent: 'praise' }, { t: '{n} welcome to the chaos', intent: 'praise' },
    { t: '{n} read the pinned rules', intent: 'logistics' }, { t: 'oh {n} has no idea what she signed up for', intent: 'roast' },
  ],
  lasagna: [
    { t: '{n} what did you DO', intent: 'roast' }, { t: '{n} near an oven is a public safety issue', intent: 'roast' },
    { t: 'who lets {n} cook??', intent: 'roast' }, { t: '{n} are you ok?? is the kitchen ok??', intent: 'logistics' },
    { t: '{n} owes the host a new pan', intent: 'roast' }, { t: '{n} just set off every alarm in the building 💀', intent: 'roast' },
  ],
  lasagna_lore: [
    { t: '{n} please do not make lasagna', intent: 'roast' }, { t: 'this is giving lasagna incident, {n}', intent: 'roast' },
    { t: '{n} near a kitchen again?? 😭', intent: 'roast' },
  ],
  rivalry: [
    { t: '{n} you’re getting smoked in fantasy', intent: 'roast' }, { t: '{n} is a fraud and the standings prove it', intent: 'sarcastic' },
    { t: 'rematch {n}?', intent: 'logistics' }, { t: '{n} stop checking the standings every 5 min', intent: 'roast' },
    { t: "i'm not losing to {n} again", intent: 'hostile' }, { t: '{n} that trade was a crime', intent: 'hostile' },
    { t: 'imagine losing to {n} lol', intent: 'roast' }, { t: '{n} talks big for someone in last place', intent: 'sarcastic' },
  ],
  rivalry_climax: [
    { t: '{n} LOST THE BET 😂', intent: 'roast' }, { t: '{n} has to wear the jersey to class now', intent: 'roast' },
    { t: '{n} pay up', intent: 'logistics' }, { t: '{n} you cheated and you know it', intent: 'hostile' },
  ],
  fight: [
    { t: '{n} i can’t believe you would say that', intent: 'hostile' }, { t: '{n} you know what you did', intent: 'hostile' },
    { t: 'i’m leaving this conversation {n}', intent: 'hostile' }, { t: '{n} that’s not fair and you know it', intent: 'hostile' },
    { t: 'don’t {n}, just don’t', intent: 'hostile' }, { t: 'wow ok {n}, noted', intent: 'sarcastic' },
  ],
  fight_bystander: [
    { t: 'is everyone ok?? {n}?', intent: 'logistics' }, { t: '{n} maybe talk to her in private', intent: 'logistics' },
    { t: '{n} take a breath', intent: 'logistics' },
  ],
  reconcile: [
    { t: '{n} i missed you 🥹', intent: 'praise' }, { t: '{n} i’m sorry for everything', intent: 'praise' },
    { t: '{n} and i are good now 🫶', intent: 'praise' }, { t: 'love you {n}, for real', intent: 'praise' },
  ],
  reconcile_bystander: [
    { t: '{n} back in the group pics we love to see it', intent: 'praise' }, { t: 'FINALLY {n}', intent: 'praise' },
  ],
  finals: [
    { t: 'good luck {n} you got this 📚', intent: 'praise' }, { t: '{n} come back to us', intent: 'logistics' },
    { t: '{n} is in the library arc', intent: 'roast' }, { t: 'sending {n} brain cells', intent: 'praise' },
  ],
  finals_over: [
    { t: '{n} IS FREE', intent: 'praise' }, { t: 'welcome back {n} we missed you', intent: 'praise' },
    { t: '{n} where are we celebrating', intent: 'logistics' },
  ],
  trip: [
    { t: '{n} on the aux was elite', intent: 'praise' }, { t: '{n} fell off the dock 😭', intent: 'roast' },
    { t: '{n} planned this perfectly', intent: 'praise' }, { t: '{n} drop the photos', intent: 'logistics' },
    { t: '{n} snoring was a whole soundtrack', intent: 'roast' }, { t: 'best weekend ever thanks to {n}', intent: 'praise' },
  ],
  member_left: [
    { t: 'wait did {n} leave?', intent: 'logistics' }, { t: '{n} come back 😭', intent: 'praise' },
    { t: 'rip {n}, gone but not forgotten', intent: 'roast' }, { t: 'did something happen with {n}', intent: 'logistics' },
  ],
  dj_set: [
    { t: '{n} your set was insane 🔥', intent: 'praise' }, { t: '{n} played my song i’m crying', intent: 'praise' },
    { t: '{n} is famous now we knew him when', intent: 'praise' }, { t: '{n} what was the third song', intent: 'logistics' },
  ],
  finale_party: [
    { t: '{n} called it', intent: 'praise' }, { t: '{n} stop spoiling it', intent: 'hostile' },
    { t: '{n} bring the snacks', intent: 'logistics' }, { t: '{n} cried at the ending don’t lie 😂', intent: 'roast' },
  ],
};

const EVENT_PLAIN: Record<string, string[]> = {
  birthday: ['cake at {place} {time}!!', 'who is bringing candles', 'the birthday playlist is ready', '🎂🎂🎂'],
  lasagna: ['the kitchen is literally smoking', 'who puts a lasagna in at 500 degrees', 'RIP lasagna 🕯️', 'the fire alarm is STILL going', 'i have never laughed this hard'],
  lasagna_lore: ['never forget the lasagna incident', 'lasagna incident 2.0 incoming', 'this chat has not been the same since the lasagna'],
  rivalry: ['the standings are a war zone', 'fantasy league is getting personal', 'whoever loses wears the jersey'],
  fight: ['can we not do this in the gc', 'omg', 'yikes', '...', 'everyone just breathe'],
  trip: ['the lake was unreal', 'who has the photos', 'sunset from the dock 😭', 'best weekend ever', 'i have sand everywhere', 'who took my towel'],
  finale_party: ['no spoilers', 'WHO saw that ending', 'i’m not okay after that finale', 'season 2 when', 'that twist???'],
  watch_night: ['watch party {time}?', 'what are we watching tonight', 'my place, bring snacks', '{show} or {show} tonight'],
  dj_set: ['that set was insane', 'my ears are still ringing', 'best night of the summer'],
  finals_over: ['finals are over!!!', 'summer starts NOW'],
};

const EVENT_TOPIC: Partial<Record<string, Topic>> = { watch_night: 'shows', trip: 'plans', finale_party: 'shows', dj_set: 'music' };

export type Composed = { text: string; intents: Array<{ targetId: string; alias: string; intent: Intent }> };

function fill(rng: Rng, template: string): string {
  return template.replace(/\{(food|show|place|time|game|favor|excuse|class|num)\}/g, (_, k: string) => rng.pick(SLOTS[k]!));
}

/** Apply the sender's texting style. Names are already substituted; case changes don't hurt resolution. */
function stylize(rng: Rng, text: string, sender: CastMember): string {
  let out = text;
  if (rng.chance(sender.style.caps)) out = out.toUpperCase();
  else if (rng.chance(sender.style.lowercase)) out = out.toLowerCase();
  if (rng.chance(sender.style.emoji) && sender.style.emojis.length) out += ' ' + rng.pick(sender.style.emojis);
  return out;
}

/** How someone refers to a friend: mostly a nickname, sometimes their display name. */
export function pickAlias(rng: Rng, target: CastMember, displayName: string): string {
  if (target.nicknames.length && rng.chance(0.85)) return rng.pick(target.nicknames);
  // single-token display names ('theo 🏀', 'Bea') are typed as the bare word
  const bare = displayName.replace(/[^\p{L}\p{N}' .]/gu, '').trim();
  return bare.split(' ')[0]!.toLowerCase() || target.nicknames[0] || bare;
}

export function generic(rng: Rng, sender: CastMember, topic: Topic): string {
  const r = rng.next();
  let base: string;
  if (r < 0.06 && sender.catchphrases.length) base = rng.pick(sender.catchphrases);
  else if (r < 0.42) base = rng.pick(BANTER);
  else if (r < 0.5) base = rng.pick(LAUGHS);
  else base = fill(rng, rng.pick(TOPIC_LINES[topic]));
  return stylize(rng, base, sender);
}

export function mention(rng: Rng, sender: CastMember, target: CastMember, alias: string, intent: Intent): Composed {
  const text = fill(rng, rng.pick(MENTION[intent])).replace('{n}', alias);
  return { text: stylize(rng, text, sender), intents: [{ targetId: target.id, alias, intent }] };
}

export function eventMention(rng: Rng, sender: CastMember, key: string, target: CastMember, alias: string): Composed | null {
  const bank = EVENT_LINES[key];
  if (!bank) return null;
  const tpl = rng.pick(bank);
  const text = fill(rng, tpl.t).replace('{n}', alias);
  return { text: stylize(rng, text, sender), intents: [{ targetId: target.id, alias, intent: tpl.intent }] };
}

export function eventPlain(rng: Rng, sender: CastMember, key: string): string | null {
  const bank = EVENT_PLAIN[key];
  return bank ? stylize(rng, fill(rng, rng.pick(bank)), sender) : null;
}

export function eventTopic(key: string): Topic | undefined {
  return EVENT_TOPIC[key];
}

/** Two targets, opposite intents: "{a} carried, {b} got carried". */
export function comparison(rng: Rng, sender: CastMember, a: CastMember, aliasA: string, b: CastMember, aliasB: string): Composed {
  const forms: Array<[string, Intent, Intent]> = [
    ['{a} carried, {b} got carried', 'praise', 'roast'],
    ['{a} > {b} and it’s not close', 'praise', 'roast'],
    ['{a} is right and {b} is being dramatic', 'praise', 'roast'],
    ['{a} and {b} are the best duo in this chat', 'praise', 'praise'],
    ['{a} and {b} need to stop', 'roast', 'roast'],
  ];
  const [tpl, ia, ib] = rng.pick(forms);
  const text = tpl.replace('{a}', aliasA).replace('{b}', aliasB);
  return {
    text: stylize(rng, text, sender),
    intents: [{ targetId: a.id, alias: aliasA, intent: ia }, { targetId: b.id, alias: aliasB, intent: ib }],
  };
}

export function mediaCaption(rng: Rng, kind: string): string {
  if (kind === 'reel') return rng.pick(['', '', 'this is literally us', 'LMAOOO', 'watch this', '💀', 'no because']);
  if (kind === 'link') return rng.pick(['', 'listen to this', 'read this', 'thoughts?']);
  return '';
}

export function mentionReel(rng: Rng, sender: CastMember, target: CastMember, alias: string): Composed {
  const tpl = rng.pick(['{n} this is you', '{n} 💀💀', 'this is so {n}', '{n} watch this']);
  return { text: stylize(rng, tpl.replace('{n}', alias), sender), intents: [{ targetId: target.id, alias, intent: 'roast' }] };
}
