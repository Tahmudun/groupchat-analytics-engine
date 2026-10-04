import { RateLimitError } from '@/lib/llm/groq';
import { classifyBatchWithRepair, neutralFill, type SentimentInput } from '@/lib/sentiment/contract';
import { storeResults } from '@/lib/sentiment/run';
import { estimateTokens } from '@/lib/providers/types';
import type { Lane } from '@/lib/providers/config';
import { LaneLimiter } from './limiter';
import { WorkQueue, type WorkScope } from './queue';

export type LaneStats = {
  id: string;
  version: string;
  batchesDone: number;
  messagesDone: number;
  repaired: number;
  failedRetriable: number;
  drained: number;
  lastError: string | null;
};

export type DispatcherHandle = {
  lanes: Array<{ stats: LaneStats; limiter: LaneLimiter }>;
  /** resolves when every lane has drained the queue or shutdown was requested */
  done: Promise<void>;
  shutdown(): void;
};

const BACKOFF_BASE_MS = 2000;
const BACKOFF_MAX_MS = 5 * 60_000;

export function runDispatcher(
  chatId: string,
  lanes: Lane[],
  opts: {
    limitMessages?: number;
    /** Operational override for repair passes whose combined output exceeds a provider cap. */
    batchSize?: number;
    verbose?: boolean;
    /** Give every lane its own model-specific queue over the same bounded target set. */
    ensembleScope?: Omit<WorkScope, 'modelVersion'>;
  } = {},
): DispatcherHandle {
  const maxBatch = opts.batchSize ?? Math.max(...lanes.map(l => l.config.batchSize));
  const sharedQueue = opts.ensembleScope
    ? null
    : new WorkQueue(chatId, maxBatch, opts.limitMessages);
  const signal = { aborted: false };

  const laneStates = lanes.map(lane => ({
    lane,
    queue: sharedQueue ?? new WorkQueue(chatId, maxBatch, opts.limitMessages, {
      ...opts.ensembleScope,
      modelVersion: lane.adapter.version,
    }),
    limiter: new LaneLimiter(lane.config),
    stats: {
      id: lane.adapter.id,
      version: lane.adapter.version,
      batchesDone: 0,
      messagesDone: 0,
      repaired: 0,
      failedRetriable: 0,
      drained: 0,
      lastError: null,
    } as LaneStats,
  }));

  async function laneWorker({ lane, queue, limiter, stats }: (typeof laneStates)[number]): Promise<void> {
    let consecutive429s = 0;
    while (!signal.aborted) {
      const batch = await queue.next(opts.batchSize ?? lane.config.batchSize);
      if (batch === null) return;
      const targetCount = batch.reduce((n, b) => n + b.targets.length, 0);

      // limiter-gated completeJson: every call (including the repair retry)
      // waits for bucket room and reports real usage back
      const gated = async (prompt: string): Promise<string> => {
        const est = estimateTokens(prompt, targetCount);
        await limiter.acquire(est, signal);
        const { text, usage } = await lane.adapter.completeJson(prompt);
        limiter.recordUsage(est, usage?.totalTokens ?? null);
        return text;
      };

      try {
        const outcome = await classifyBatchWithRepair(gated, batch);
        consecutive429s = 0;
        if (outcome.ok) {
          await storeResults(chatId, lane.adapter.version, outcome.results);
          queue.complete(batch);
          stats.batchesDone += 1;
          stats.messagesDone += batch.length;
          if (outcome.repaired) stats.repaired += 1;
          if (opts.verbose) console.log(`[${lane.adapter.id}] batch of ${batch.length} ok${outcome.repaired ? ' (repaired)' : ''}`);
        } else {
          await storeResults(chatId, lane.adapter.version, outcome.partial);
          stats.failedRetriable += 1;
          stats.lastError = outcome.reason;
          console.error(`[${lane.adapter.id}] failed-retriable batch of ${batch.length}: ${outcome.reason}`);
          const struckOut = queue.requeue(batch);
          if (struckOut.length > 0) {
            await storeResults(chatId, lane.adapter.version, neutralFill(struckOut, outcome.partial));
            stats.drained += struckOut.length;
            console.error(`[${lane.adapter.id}] drained ${struckOut.length} messages to neutral after repeated failures`);
          }
        }
      } catch (err) {
        if (err instanceof Error && err.message === 'shutdown') { queue.release(batch); return; }
        if (err instanceof RateLimitError) {
          // lane pauses; others keep pulling. Respect Retry-After when given.
          consecutive429s += 1;
          const wait = err.retryAfterMs ?? Math.min(BACKOFF_BASE_MS * 2 ** consecutive429s, BACKOFF_MAX_MS);
          limiter.pauseFor(wait);
          stats.lastError = `429 — paused ${Math.round(wait / 1000)}s`;
          queue.release(batch); // no strike: the lane hit its limit, the batch is fine
        } else {
          stats.failedRetriable += 1;
          stats.lastError = err instanceof Error ? err.message : String(err);
          console.error(`[${lane.adapter.id}] failed-retriable batch of ${batch.length}: ${stats.lastError}`);
          const struckOut = queue.requeue(batch);
          if (struckOut.length > 0) {
            await storeResults(chatId, lane.adapter.version, neutralFill(struckOut, []));
            stats.drained += struckOut.length;
          }
        }
      }
    }
  }

  const done = Promise.all(laneStates.map(s => laneWorker(s).catch(err => {
    s.stats.lastError = `lane crashed: ${err instanceof Error ? err.message : err}`;
    console.error(`[${s.lane.adapter.id}] ${s.stats.lastError}`);
  }))).then(() => undefined);

  return {
    lanes: laneStates.map(s => ({ stats: s.stats, limiter: s.limiter })),
    done,
    shutdown() { signal.aborted = true; },
  };
}
