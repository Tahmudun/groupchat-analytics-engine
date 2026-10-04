import { describe, expect, it } from 'vitest';
import { moveId } from '@/lib/admin/reorder';

describe('moveId', () => {
  it('swaps one step up', () => {
    expect(moveId([1, 2, 3], 3, 'up')).toEqual([1, 3, 2]);
  });

  it('swaps one step down', () => {
    expect(moveId([1, 2, 3], 1, 'down')).toEqual([2, 1, 3]);
  });

  it('no-ops moving the first item up', () => {
    expect(moveId([1, 2, 3], 1, 'up')).toBeNull();
  });

  it('no-ops moving the last item down', () => {
    expect(moveId([1, 2, 3], 3, 'down')).toBeNull();
  });

  it('no-ops on an id not in the list', () => {
    expect(moveId([1, 2, 3], 9, 'up')).toBeNull();
  });

  it('does not mutate its input', () => {
    const ids = [1, 2, 3];
    moveId(ids, 2, 'up');
    expect(ids).toEqual([1, 2, 3]);
  });
});
