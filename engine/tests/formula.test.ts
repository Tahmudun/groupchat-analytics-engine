import { describe, it, expect } from 'vitest';
import {
  composeScore, activityComponent, sentimentComponent, reactionComponent,
  engagementComponent, longevityComponent, messageWeight, SCORING_VERSION,
} from '@/lib/scoring/formula';

describe('scoring formula', () => {
  it('exposes a version constant', () => {
    expect(SCORING_VERSION).toBe(1);
  });

  it('components are bounded 0..1', () => {
    expect(activityComponent(0)).toBe(0);
    expect(activityComponent(10000)).toBe(1);
    expect(reactionComponent(10000)).toBe(1);
    expect(engagementComponent(10000)).toBe(1);
    expect(longevityComponent(0)).toBe(0);
    expect(longevityComponent(100000)).toBe(1);
  });

  it('sentiment maps [-1,1] to [0,1] with null → neutral 0.5', () => {
    expect(sentimentComponent(null)).toBe(0.5);
    expect(sentimentComponent(-1)).toBe(0);
    expect(sentimentComponent(1)).toBe(1);
    expect(sentimentComponent(0)).toBe(0.5);
  });

  it('composeScore spans 0..2000 and all-neutral lands mid-range', () => {
    expect(composeScore({ activity: 0, sentiment: 0, reaction: 0, engagement: 0, longevity: 0 })).toBe(0);
    expect(composeScore({ activity: 1, sentiment: 1, reaction: 1, engagement: 1, longevity: 1 })).toBe(2000);
    const neutral = composeScore({ activity: 0.5, sentiment: 0.5, reaction: 0.5, engagement: 0.5, longevity: 0.5 });
    expect(neutral).toBe(1000);
  });

  it('media messages weigh more than text, system events weigh zero', () => {
    expect(messageWeight('message', 'photo')).toBeGreaterThan(messageWeight('message', null));
    expect(messageWeight('system_added', null)).toBe(0);
  });

  it('longevity is log-scaled: first month gains faster than third year', () => {
    const early = longevityComponent(30) - longevityComponent(0);
    const late = longevityComponent(1095) - longevityComponent(1065);
    expect(early).toBeGreaterThan(late * 5);
  });
});
