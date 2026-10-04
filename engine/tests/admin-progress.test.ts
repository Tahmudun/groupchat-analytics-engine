import { describe, it, expect } from 'vitest';
import { BYTES_PER_MESSAGE, estimateTotalMessages, ingestPercent, pipelinePercent } from '@/lib/admin/progress';

describe('estimateTotalMessages', () => {
  it('divides bytes by the calibrated bytes-per-message', () => {
    expect(estimateTotalMessages(BYTES_PER_MESSAGE * 1000)).toBe(1000);
  });

  it('never estimates below 1 message', () => {
    expect(estimateTotalMessages(0)).toBe(1);
    expect(estimateTotalMessages(3)).toBe(1);
  });
});

describe('ingestPercent', () => {
  it('is 0 before any progress arrives', () => {
    expect(ingestPercent(undefined)).toBe(0);
  });

  it('tracks parsed against the estimate', () => {
    expect(ingestPercent({ phase: 'parsing', parsed: 5000, inserted: 0, estimatedTotal: 10000 })).toBe(50);
  });

  it('clamps to 99 when the estimate undershoots reality', () => {
    expect(ingestPercent({ phase: 'parsing', parsed: 20000, inserted: 0, estimatedTotal: 10000 })).toBe(99);
  });

  it('holds at 99 while finalizing regardless of counts', () => {
    expect(ingestPercent({ phase: 'finalizing', parsed: 100, inserted: 0, estimatedTotal: 10000 })).toBe(99);
  });

  it('is 0 when no estimate is attached', () => {
    expect(ingestPercent({ phase: 'parsing', parsed: 100, inserted: 0 })).toBe(0);
  });

  it('is 0 for a pipeline-kind progress (wrong helper)', () => {
    expect(ingestPercent({ kind: 'pipeline', done: 5, total: 10, label: 'x' })).toBe(0);
  });
});

describe('pipelinePercent', () => {
  it('tracks done against total', () => {
    expect(pipelinePercent({ kind: 'pipeline', done: 3, total: 12, label: '' })).toBe(25);
  });

  it('is null when total is unknown (indeterminate)', () => {
    expect(pipelinePercent({ kind: 'pipeline', done: 5, total: null, label: '' })).toBeNull();
    expect(pipelinePercent(undefined)).toBeNull();
  });

  it('clamps within 0..100', () => {
    expect(pipelinePercent({ kind: 'pipeline', done: 99, total: 10, label: '' })).toBe(100);
  });
});
