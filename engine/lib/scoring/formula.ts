// ============================================================================
// THE scoring constants. Tune here, bump SCORING_VERSION, rescore.
// Spec: composite 0–2000 like a stock index. Each component normalizes to
// 0..1, the weighted blend scales to the index range.
// ============================================================================

export const SCORING_VERSION = 1;

// Component weights — MUST sum to 1.0.
export const ACTIVITY_WEIGHT = 0.30;
export const SENTIMENT_WEIGHT = 0.25;
export const REACTION_WEIGHT = 0.20;
export const ENGAGEMENT_WEIGHT = 0.15;
export const LONGEVITY_WEIGHT = 0.10;

// Saturation points: the daily value at which a component maxes out.
export const ACTIVITY_SATURATION = 50;    // weighted messages/day
export const REACTION_SATURATION = 25;    // reactions received/day
export const ENGAGEMENT_SATURATION = 20;  // replies received/day
export const LONGEVITY_HORIZON_DAYS = 1095; // ~3 years to full longevity credit

// Message-type weights: media carries more effort than text; system events none.
export const TEXT_WEIGHT = 1.0;
export const MEDIA_WEIGHT = 1.5;

export const INDEX_RANGE = 2000;

export type DayComponents = {
  activity: number; sentiment: number; reaction: number; engagement: number; longevity: number;
};

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

export function messageWeight(messageType: string, mediaType: string | null): number {
  if (messageType !== 'message') return 0;
  return mediaType ? MEDIA_WEIGHT : TEXT_WEIGHT;
}

export const activityComponent = (weightedMessages: number) => clamp01(weightedMessages / ACTIVITY_SATURATION);
export const sentimentComponent = (meanSentiment: number | null) => meanSentiment === null ? 0.5 : clamp01((meanSentiment + 1) / 2);
export const reactionComponent = (reactionsReceived: number) => clamp01(reactionsReceived / REACTION_SATURATION);
export const engagementComponent = (repliesReceived: number) => clamp01(repliesReceived / ENGAGEMENT_SATURATION);
export const longevityComponent = (daysSinceFirst: number) =>
  clamp01(Math.log10(1 + Math.max(0, daysSinceFirst)) / Math.log10(1 + LONGEVITY_HORIZON_DAYS));

export function composeScore(c: DayComponents): number {
  const blended =
    ACTIVITY_WEIGHT * c.activity +
    SENTIMENT_WEIGHT * c.sentiment +
    REACTION_WEIGHT * c.reaction +
    ENGAGEMENT_WEIGHT * c.engagement +
    LONGEVITY_WEIGHT * c.longevity;
  return Math.round(INDEX_RANGE * clamp01(blended));
}
