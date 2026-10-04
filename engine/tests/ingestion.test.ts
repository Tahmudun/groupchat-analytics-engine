import { describe, it, expect } from 'vitest';
import { chunk } from '@/lib/ingestion/pipeline';

describe('chunk', () => {
  it('splits into fixed-size batches with a ragged tail', () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });
  it('handles empty input', () => {
    expect(chunk([], 10)).toEqual([]);
  });
});
