import type { JobProgress, PipelineJobProgress } from './jobs';

/**
 * Pure progress math, importable from client components (no node deps).
 * Calibrated 2026-07-06 against the real Instagram exports in data/flix:
 * 312,142,836 bytes / 744,146 messages = 419.5 bytes per message.
 */
export const BYTES_PER_MESSAGE = 420;

export function estimateTotalMessages(totalBytes: number): number {
  return Math.max(1, Math.round(totalBytes / BYTES_PER_MESSAGE));
}

/** Honest percent: real parsed count vs the byte estimate, clamped at 99
 *  until the job itself reports done. Finalizing (members/stats/ANALYZE)
 *  holds at 99. */
export function ingestPercent(p: JobProgress | undefined): number {
  if (!p || p.kind === 'pipeline') return 0;
  if (p.phase === 'finalizing') return 99;
  if (!p.estimatedTotal) return 0;
  return Math.min(99, Math.floor((p.parsed / p.estimatedTotal) * 100));
}

/** Percent for a determinate pipeline step, or null when work isn't bounded
 *  yet (the UI then shows an indeterminate bar). */
export function pipelinePercent(p: PipelineJobProgress | undefined): number | null {
  if (!p || p.total == null || p.total <= 0) return null;
  return Math.min(100, Math.max(0, Math.floor((p.done / p.total) * 100)));
}
