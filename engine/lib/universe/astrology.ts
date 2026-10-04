import type { MemberInsight } from './insights';

export const ZODIAC_SIGNS = [
  'aries', 'taurus', 'gemini', 'cancer', 'leo', 'virgo',
  'libra', 'scorpio', 'sagittarius', 'capricorn', 'aquarius', 'pisces',
] as const;

export type ZodiacSign = (typeof ZODIAC_SIGNS)[number];
type Element = 'Fire' | 'Earth' | 'Air' | 'Water';
type Modality = 'Cardinal' | 'Fixed' | 'Mutable';
type Polarity = 'Outward' | 'Inward';

export type ZodiacProfile = {
  id: ZodiacSign;
  name: string;
  glyph: string;
  element: Element;
  modality: Modality;
  polarity: Polarity;
  traditionalRuler: string;
  modernRuler?: string;
  drive: string;
  gift: string;
  shadow: string;
  entrance: string;
  defense: string;
};

export const ZODIAC: Record<ZodiacSign, ZodiacProfile> = {
  aries: { id: 'aries', name: 'Aries', glyph: '♈', element: 'Fire', modality: 'Cardinal', polarity: 'Outward', traditionalRuler: 'Mars', drive: 'prove aliveness through decisive movement and self-authorship', gift: 'the courage to begin before consensus exists', shadow: 'mistaking urgency for truth, or resistance for a challenge that must be won', entrance: 'direct, fast, and self-starting', defense: 'moving first so uncertainty cannot set the terms' },
  taurus: { id: 'taurus', name: 'Taurus', glyph: '♉', element: 'Earth', modality: 'Fixed', polarity: 'Inward', traditionalRuler: 'Venus', drive: 'build a life that feels stable, pleasurable, and worth preserving', gift: 'loyalty, patience, and a strong instinct for lasting value', shadow: 'confusing safety with sameness and holding on after the meaning has left', entrance: 'grounded, selective, and quietly self-possessed', defense: 'slowing the pace until trust and control return' },
  gemini: { id: 'gemini', name: 'Gemini', glyph: '♊', element: 'Air', modality: 'Mutable', polarity: 'Outward', traditionalRuler: 'Mercury', drive: 'understand life by naming, comparing, and exchanging perspectives', gift: 'mental agility and the ability to keep information moving', shadow: 'using motion, irony, or explanation to avoid staying with one difficult truth', entrance: 'quick, curious, and socially adaptable', defense: 'changing the frame before anyone can pin down the feeling' },
  cancer: { id: 'cancer', name: 'Cancer', glyph: '♋', element: 'Water', modality: 'Cardinal', polarity: 'Inward', traditionalRuler: 'Moon', drive: 'create belonging by protecting memory, intimacy, and emotional continuity', gift: 'sensitivity to what a group needs before it is said aloud', shadow: 'protecting vulnerability through retreat, indirectness, or loyalty tests', entrance: 'observant, familiar, and protective', defense: 'withdrawing behind a shell while continuing to track every emotional shift' },
  leo: { id: 'leo', name: 'Leo', glyph: '♌', element: 'Fire', modality: 'Fixed', polarity: 'Outward', traditionalRuler: 'Sun', drive: 'express a distinct creative self and have that expression genuinely witnessed', gift: 'warmth, courage, generosity, and a memorable personal signature', shadow: 'treating recognition as proof of worth or pride as protection from being ordinary', entrance: 'confident, expressive, and naturally theatrical', defense: 'holding the pose until dignity feels restored' },
  virgo: { id: 'virgo', name: 'Virgo', glyph: '♍', element: 'Earth', modality: 'Mutable', polarity: 'Inward', traditionalRuler: 'Mercury', drive: 'make complexity useful through discernment, craft, and intelligent service', gift: 'precision and the ability to notice what would make something work better', shadow: 'turning discernment inward until improvement becomes chronic self-critique', entrance: 'measured, perceptive, and more prepared than it first appears', defense: 'analyzing the flaw so thoroughly that the feeling becomes secondary' },
  libra: { id: 'libra', name: 'Libra', glyph: '♎', element: 'Air', modality: 'Cardinal', polarity: 'Outward', traditionalRuler: 'Venus', drive: 'create meaning through relationship, proportion, and mutual recognition', gift: 'social intelligence and the ability to make different people legible to one another', shadow: 'outsourcing desire to preserve harmony or confusing indecision with fairness', entrance: 'charming, polished, and relationship-aware', defense: 'managing the atmosphere so open conflict never gets to define the scene' },
  scorpio: { id: 'scorpio', name: 'Scorpio', glyph: '♏', element: 'Water', modality: 'Fixed', polarity: 'Inward', traditionalRuler: 'Mars', modernRuler: 'Pluto', drive: 'penetrate appearances, protect what matters, and form bonds that can survive truth', gift: 'emotional courage, loyalty, and an instinct for hidden motives', shadow: 'using secrecy, suspicion, or control to avoid the vulnerability of needing someone', entrance: 'magnetic, private, and difficult to read quickly', defense: 'controlling access until another person proves they can hold the intensity' },
  sagittarius: { id: 'sagittarius', name: 'Sagittarius', glyph: '♐', element: 'Fire', modality: 'Mutable', polarity: 'Outward', traditionalRuler: 'Jupiter', drive: 'expand life through meaning, candor, movement, and a larger horizon', gift: 'hope, perspective, humor, and the nerve to tell the bigger story', shadow: 'outrunning nuance, limits, or consequences in the name of freedom', entrance: 'open, restless, and larger than the immediate moment', defense: 'turning pain into a joke, lesson, or exit route' },
  capricorn: { id: 'capricorn', name: 'Capricorn', glyph: '♑', element: 'Earth', modality: 'Cardinal', polarity: 'Inward', traditionalRuler: 'Saturn', drive: 'earn durable authority through discipline, timing, and self-command', gift: 'strategic patience and the capacity to carry responsibility over time', shadow: 'making usefulness the price of belonging or withholding softness until success feels secure', entrance: 'composed, capable, and intentional', defense: 'becoming more controlled, productive, and difficult to reach' },
  aquarius: { id: 'aquarius', name: 'Aquarius', glyph: '♒', element: 'Air', modality: 'Fixed', polarity: 'Outward', traditionalRuler: 'Saturn', modernRuler: 'Uranus', drive: 'understand the collective without surrendering intellectual independence', gift: 'original perspective and the ability to see systems larger than one personality', shadow: 'using detachment or exceptionalism to remain untouched by ordinary emotional needs', entrance: 'independent, intriguing, and socially unconventional', defense: 'stepping outside the group mentally before the group can define the role' },
  pisces: { id: 'pisces', name: 'Pisces', glyph: '♓', element: 'Water', modality: 'Mutable', polarity: 'Inward', traditionalRuler: 'Jupiter', modernRuler: 'Neptune', drive: 'find meaning by dissolving boundaries between imagination, feeling, and experience', gift: 'empathy, symbolic intelligence, and receptivity to what others overlook', shadow: 'escaping definition when reality demands a boundary, decision, or disappointment', entrance: 'receptive, atmospheric, and emotionally porous', defense: 'blurring, disappearing, or becoming whatever the moment seems to require' },
};

const RULER_METHOD: Record<string, string> = {
  Sun: 'visibility, authorship, and creative self-possession',
  Moon: 'instinct, memory, care, and responsiveness',
  Mercury: 'language, perception, adaptation, and interpretation',
  Venus: 'attraction, values, pleasure, and relationship',
  Mars: 'assertion, appetite, conflict, and decisive action',
  Jupiter: 'meaning, expansion, confidence, and perspective',
  Saturn: 'boundaries, mastery, endurance, and consequence',
};

const ELEMENT_METHOD: Record<Element, { core: string; interface: string }> = {
  Fire: { core: 'seeks meaning through action, appetite, and visible conviction', interface: 'makes energy visible and invites a response' },
  Earth: { core: 'seeks security through proof, usefulness, and tangible follow-through', interface: 'slows the field down and establishes reliability' },
  Air: { core: 'seeks clarity through words, perspective, and exchange', interface: 'opens contact through language, wit, or observation' },
  Water: { core: 'seeks truth through feeling, instinct, and emotional bonds', interface: 'reads the atmosphere before deciding what is safe to reveal' },
};

const ELEMENT_PAIRS: Record<string, { gift: string; tension: string; practice: string }> = {
  'Fire|Fire': { gift: 'conviction moves cleanly from desire into expression', tension: 'there may be no cooling system when pride or urgency takes over', practice: 'leave enough silence to distinguish inspiration from reaction' },
  'Earth|Earth': { gift: 'inner priorities and outer behavior both value consistency', tension: 'adaptation may feel like betrayal long after change becomes necessary', practice: 'treat flexibility as maintenance, not instability' },
  'Air|Air': { gift: 'thought, language, and social presentation reinforce one another', tension: 'experience can remain conceptual when feeling or commitment is required', practice: 'let one important idea become a concrete choice' },
  'Water|Water': { gift: 'instinct and presentation share the same emotional language', tension: 'boundaries can blur and moods can become self-confirming', practice: 'name the feeling before asking the room to carry it' },
  'Air|Fire': { gift: 'ideas give direction to courage, while courage gives consequence to ideas', tension: 'speed and stimulation can replace reflection', practice: 'decide which thought deserves sustained fire' },
  'Earth|Water': { gift: 'feeling receives structure and structure receives humanity', tension: 'self-protection can become quiet immobility', practice: 'make care visible through one concrete action' },
  'Earth|Fire': { gift: 'vision can become real instead of remaining a burst of enthusiasm', tension: 'the need to act and the need to verify may frustrate one another', practice: 'give boldness a container without making it ask permission forever' },
  'Fire|Water': { gift: 'passion gains emotional depth and feeling gains the courage to move', tension: 'pride and vulnerability may take turns controlling the story', practice: 'say what matters before intensity turns into theater or retreat' },
  'Air|Earth': { gift: 'concepts can be tested, refined, and made useful', tension: 'one side wants possibility while the other demands proof', practice: 'translate the idea into a small experiment rather than a final verdict' },
  'Air|Water': { gift: 'emotion becomes articulate and thought becomes more humane', tension: 'analysis and instinct may distrust each other’s evidence', practice: 'let language describe the feeling without cross-examining it' },
};

const MODALITY_PAIRS: Record<string, { gift: string; tension: string }> = {
  'Cardinal|Cardinal': { gift: 'a double initiating signature that can set tone quickly', tension: 'starting, steering, and self-protection may all happen before listening' },
  'Fixed|Fixed': { gift: 'enormous concentration, loyalty, and staying power', tension: 'an internal position and an external stance can lock each other in place' },
  'Mutable|Mutable': { gift: 'range, responsiveness, and unusual social fluency', tension: 'adaptability can become diffusion when a stable position is needed' },
  'Cardinal|Fixed': { gift: 'one part begins what the other can sustain', tension: 'the impulse to redirect can collide with the need to preserve control' },
  'Cardinal|Mutable': { gift: 'initiative has enough flexibility to survive changing conditions', tension: 'a new direction can appear before the previous one becomes legible' },
  'Fixed|Mutable': { gift: 'a stable center can learn, improvise, and translate', tension: 'one part protects continuity while the other keeps revising the terms' },
};

export type WholeSignRelationship = {
  steps: number;
  name: 'Conjunction' | 'Semi-sextile' | 'Sextile' | 'Square' | 'Trine' | 'Quincunx' | 'Opposition';
  dynamic: string;
  revelation: string;
};

const RELATIONSHIPS: WholeSignRelationship[] = [
  { steps: 0, name: 'Conjunction', dynamic: 'The inner motive and social interface use the same symbolic language. People tend to meet the same pattern that organizes you privately.', revelation: 'Your coherence is obvious; the blind spot is over-identifying with one way of being.' },
  { steps: 1, name: 'Semi-sextile', dynamic: 'These neighboring signs do not share element or modality, so the outer style and inner motive require small, constant acts of translation.', revelation: 'You may seem almost understood before revealing the one motive nobody anticipated.' },
  { steps: 2, name: 'Sextile', dynamic: 'The signs offer one another usable opportunities. The social interface can open a door that the inner self knows how to develop.', revelation: 'Your gifts compound when you act deliberately; ease appears through participation, not passivity.' },
  { steps: 3, name: 'Square', dynamic: 'The signs share modality but not element. They want to move through life at the same tempo while disagreeing about what should lead.', revelation: 'The friction is productive: you become compelling by learning to hold two strong instructions without flattening either one.' },
  { steps: 4, name: 'Trine', dynamic: 'The signs share an element, so motive and presentation recognize each other with very little translation.', revelation: 'Ease is both the talent and the blind spot; what feels natural to you may be more powerful—and less examined—than you realize.' },
  { steps: 5, name: 'Quincunx', dynamic: 'The signs share neither element, modality, nor polarity. Identity and presentation solve different problems and need continual recalibration.', revelation: 'You are not inconsistent; you are built around an adjustment that never becomes completely automatic.' },
  { steps: 6, name: 'Opposition', dynamic: 'The signs sit across one axis, making inner motive and outer presentation complementary but impossible to collapse into one another.', revelation: 'You are read in two stages: the quality people meet first eventually reveals the opposite need at your center.' },
];

const OPPOSITION_AXIS: Partial<Record<ZodiacSign, string>> = {
  aries: 'self and relationship', libra: 'self and relationship',
  taurus: 'holding and releasing', scorpio: 'holding and releasing',
  gemini: 'information and meaning', sagittarius: 'information and meaning',
  cancer: 'privacy and public responsibility', capricorn: 'privacy and public responsibility',
  leo: 'individual expression and the collective', aquarius: 'individual expression and the collective',
  virgo: 'discernment and surrender', pisces: 'discernment and surrender',
};

export function wholeSignRelationship(sunId: ZodiacSign, risingId: ZodiacSign): WholeSignRelationship {
  const raw = Math.abs(ZODIAC_SIGNS.indexOf(sunId) - ZODIAC_SIGNS.indexOf(risingId));
  const steps = Math.min(raw, 12 - raw);
  const base = RELATIONSHIPS[steps]!;
  if (steps !== 6) return base;
  return { ...base, dynamic: `${base.dynamic} This is the axis of ${OPPOSITION_AXIS[sunId] ?? 'complementary opposites'}.` };
}

export function isZodiacSign(value: unknown): value is ZodiacSign {
  return typeof value === 'string' && (ZODIAC_SIGNS as readonly string[]).includes(value);
}

const sortedPair = (a: string, b: string) => [a, b].sort().join('|');

const COMMUNITY_CONTEXT: Record<string, { demand: string; reward: string }> = {
  'The Inner Circle': { demand: 'trust, repetition, and emotional continuity', reward: 'letting familiarity deepen rather than perform loyalty' },
  'The Crossroads': { demand: 'translation between people who do not naturally share a language', reward: 'making complexity portable without erasing its truth' },
  'The Main Stage': { demand: 'visibility, output, and a recognizable contribution', reward: 'turning attention into something the room can build on' },
  'The Live Wire': { demand: 'timing, responsiveness, and comfort with sudden momentum', reward: 'knowing which spark deserves fuel and which can pass' },
  'The Chorus': { demand: 'feedback, amplification, and sensitivity to the shared mood', reward: 'responding without letting the crowd write the entire self' },
  'The Old Guard': { demand: 'continuity, memory, and respect for accumulated history', reward: 'renewing tradition instead of merely defending it' },
  'The Wildcards': { demand: 'range, surprise, and tolerance for inconsistent frequencies', reward: 'remaining distinct without requiring predictability from everyone else' },
};

const ROLE_CONTEXT: Record<string, { pattern: string; forecast: string }> = {
  'Center of Gravity': { pattern: 'The graph already shows that attention returns to you; your presence organizes conversation even when you are not trying to lead it.', forecast: 'Your influence grows when you stop chasing proof of it and become more intentional about what your gravity gathers.' },
  'Bridge Signal': { pattern: 'The graph places you between circles, so different people may encounter genuinely different facets of the same personality.', forecast: 'Your leverage grows when you translate without becoming neutral; the bridge matters because it has a point of view.' },
  'Prime Mover': { pattern: 'The graph shows that your output changes the room’s pace, making action one of the main ways people learn who you are.', forecast: 'Your next level is not more output but more authorship: choosing which contributions should define the season.' },
  'Outer Orbit': { pattern: 'The graph shows selective participation, so each appearance carries more interpretive weight than constant visibility would.', forecast: 'Your impact grows through precision, not volume; deliberate presence will read more strongly than forced consistency.' },
  'Constellation Regular': { pattern: 'The graph shows influence accumulating through social texture and repeated presence rather than one dominant extreme.', forecast: 'Your role becomes unmistakable when you name the quality you reliably add instead of waiting for a dramatic moment to prove it.' },
};

export type AstrologyReading = {
  sun?: { title: string; body: string; watch: string };
  rising?: { title: string; body: string; ruler: string };
  synthesis?: {
    title: string;
    subtitle: string;
    tags: string[];
    dynamic: string;
    community: string;
    pressure: string;
    growth: string;
    forecast: string;
  };
};

export function astrologyReading(insight: MemberInsight, sunId?: ZodiacSign | null, risingId?: ZodiacSign | null): AstrologyReading {
  const sun = sunId ? ZODIAC[sunId] : null;
  const rising = risingId ? ZODIAC[risingId] : null;
  const output: AstrologyReading = {};
  if (sun) {
    output.sun = {
      title: 'The private engine',
      body: `The Sun symbolizes the center you are trying to become consciously. ${sun.name} seeks to ${sun.drive}; its mature gift is ${sun.gift}.`,
      watch: `Its shadow appears as ${sun.shadow}.`,
    };
  }
  if (rising) {
    const modern = rising.modernRuler ? ` (with ${rising.modernRuler} as a modern co-ruler)` : '';
    output.rising = {
      title: 'The public signal',
      body: `${rising.name} Rising meets the room as ${rising.entrance}. It protects itself by ${rising.defense}.`,
      ruler: `Its traditional chart ruler is ${rising.traditionalRuler}${modern}, so the social strategy runs through ${RULER_METHOD[rising.traditionalRuler]}.`,
    };
  }
  if (!sun || !rising) return output;

  const relationship = wholeSignRelationship(sun.id, rising.id);
  const elements = ELEMENT_PAIRS[sortedPair(sun.element, rising.element)]!;
  const modalities = MODALITY_PAIRS[sortedPair(sun.modality, rising.modality)]!;
  const community = COMMUNITY_CONTEXT[insight.community.archetype] ?? { demand: insight.community.temperament, reward: 'meeting the room without abandoning your own center' };
  const role = ROLE_CONTEXT[insight.role.title] ?? ROLE_CONTEXT['Constellation Regular']!;
  const polarity = sun.polarity === rising.polarity
    ? sun.polarity === 'Outward'
      ? 'Both signs move energy outward, so internal desire becomes socially visible quickly.'
      : 'Both signs process inwardly, so people may see restraint before they understand the depth behind it.'
    : `The ${sun.name} core moves ${sun.polarity.toLowerCase()} while the ${rising.name} interface moves ${rising.polarity.toLowerCase()}, creating a meaningful gap between what motivates you and what the room can immediately read.`;
  const elementDirection = `${sun.element} at the center ${ELEMENT_METHOD[sun.element].core}; ${rising.element} at the threshold ${ELEMENT_METHOD[rising.element].interface}.`;

  output.synthesis = {
    title: `${sun.name} core · ${rising.name} interface`,
    subtitle: `${relationship.name} whole-sign dynamic · ${rising.traditionalRuler}-ruled approach`,
    tags: [`${sun.modality} ${sun.element} Sun`, `${rising.modality} ${rising.element} Rising`, `${rising.traditionalRuler} chart ruler`, `${relationship.name} pattern`],
    dynamic: `${relationship.dynamic} ${elementDirection} ${elements.gift}; the tension is that ${elements.tension}. ${polarity}`,
    community: `${insight.community.name} is ${insight.community.archetype}, a region that demands ${community.demand}. ${role.pattern} In this environment, your combination works best by ${community.reward}.`,
    pressure: `Under pressure, the ${sun.name} core may fall into ${sun.shadow}, while the ${rising.name} interface protects itself by ${rising.defense}. This can make the room react to your armor while missing the need underneath it.`,
    growth: `${relationship.revelation} The practical correction is to ${elements.practice}; this lets ${modalities.gift} without letting ${modalities.tension}.`,
    forecast: `${role.forecast} With this Sun–Rising pattern, the turning point comes when you let ${sun.gift} become visible through a ${rising.entrance} style—without using that style to hide what you actually want.`,
  };
  return output;
}
