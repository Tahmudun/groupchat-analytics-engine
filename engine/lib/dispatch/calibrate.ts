import { sql } from '@/lib/db/client';
import { withDbRetry } from '@/lib/sentiment/run';
import { classifyBatchWithRepair, type SentimentInput } from '@/lib/sentiment/contract';
import { chunk } from '@/lib/ingestion/pipeline';
import { estimateTokens } from '@/lib/providers/types';
import type { Lane } from '@/lib/providers/config';
import { RateLimitError } from '@/lib/llm/groq';
import { LaneLimiter } from './limiter';
import { calibrationMetrics, type CalibrationMetrics, type PairScore } from './stats';

export const DEFAULT_REFERENCE = 'v1-llama-3.3-70b'; // the 70b run before the lanes existed
export const DEFAULT_SAMPLE = 250;
export const PASS_DAILY_MEAN_R = 0.8;

export type CalibrationSample = {
  inputs: SentimentInput[];
  reference: PairScore[];
};

/** Random sample of messages that already have reference-version sentiments. */
export async function fetchCalibrationSample(chatId: string, referenceVersion: string, sample: number): Promise<CalibrationSample> {
  const rows = await withDbRetry(() => sql`
    SELECT m.id AS message_id, m.content, (m.timestamp AT TIME ZONE 'UTC')::date::text AS date,
           jsonb_agg(DISTINCT jsonb_build_object(
             'member_username', s.member_username,
             'alias_matched', COALESCE(mm.alias_matched, s.member_username),
             'score', s.sentiment_score)) AS refs
    FROM mention_sentiments s
    JOIN messages m ON m.id = s.message_id
    LEFT JOIN message_mentions mm ON mm.message_id = s.message_id AND mm.member_username = s.member_username
    WHERE s.chat_id = ${chatId} AND s.model_version = ${referenceVersion} AND s.confidence > 0
    GROUP BY m.id, m.content, m.timestamp
    ORDER BY md5(m.id)  -- pseudo-random but stable: runs are comparable while tuning
    LIMIT ${sample}`);

  const inputs: SentimentInput[] = [];
  const reference: PairScore[] = [];
  for (const row of rows) {
    const refs = row.refs as Array<{ member_username: string; alias_matched: string; score: number }>;
    inputs.push({
      message_id: row.message_id as string,
      content: row.content as string,
      targets: refs.map(r => ({ member_username: r.member_username, alias_matched: r.alias_matched })),
    });
    for (const r of refs) {
      reference.push({ message_id: row.message_id as string, member_username: r.member_username, date: row.date as string, score: r.score });
    }
  }
  return { inputs, reference };
}

export type LaneCalibration = {
  version: string;
  metrics: CalibrationMetrics;
  failedBatches: number;
  pass: boolean;
};

/** Run the sample through one lane (rate-limited, nothing stored). */
export async function calibrateLane(lane: Lane, samp: CalibrationSample, verbose = false): Promise<LaneCalibration> {
  const limiter = new LaneLimiter(lane.config);
  const dateByMessage = new Map(samp.reference.map(r => [r.message_id, r.date]));
  const candidate: PairScore[] = [];
  let failedBatches = 0;

  for (const batch of chunk(samp.inputs, lane.config.batchSize)) {
    const targetCount = batch.reduce((n, b) => n + b.targets.length, 0);
    const gated = async (prompt: string): Promise<string> => {
      const est = estimateTokens(prompt, targetCount);
      await limiter.acquire(est);
      const { text, usage } = await lane.adapter.completeJson(prompt);
      limiter.recordUsage(est, usage?.totalTokens ?? null);
      return text;
    };
    try {
      // one extra 429-tolerant attempt loop: calibration batches are few
      let outcome = null;
      for (let attempt = 0; outcome === null; attempt++) {
        try {
          outcome = await classifyBatchWithRepair(gated, batch);
        } catch (err) {
          if (err instanceof RateLimitError && attempt < 5) {
            limiter.pauseFor(err.retryAfterMs ?? 2000 * 2 ** attempt);
          } else throw err;
        }
      }
      const results = outcome.ok ? outcome.results : outcome.partial;
      if (!outcome.ok) failedBatches += 1;
      for (const r of results) {
        candidate.push({ message_id: r.message_id, member_username: r.member_username, date: dateByMessage.get(r.message_id) ?? '', score: r.sentiment_score });
      }
      if (verbose) console.log(`[${lane.adapter.id}] calibration batch of ${batch.length} ${outcome.ok ? 'ok' : `partial (${outcome.reason})`}`);
    } catch (err) {
      failedBatches += 1;
      console.error(`[${lane.adapter.id}] calibration batch failed: ${err instanceof Error ? err.message : err}`);
    }
  }

  const metrics = calibrationMetrics(samp.reference, candidate);
  return {
    version: lane.adapter.version,
    metrics,
    failedBatches,
    pass: Number.isFinite(metrics.dailyMeanR) && metrics.dailyMeanR >= PASS_DAILY_MEAN_R,
  };
}

export function printCalibrationTable(results: LaneCalibration[], sampleSize: number, referenceVersion: string): void {
  const fmt = (n: number) => (Number.isFinite(n) ? n.toFixed(3) : 'n/a');
  console.log(`\ncalibration vs ${referenceVersion} (${sampleSize} messages) — PASS at daily-mean r >= ${PASS_DAILY_MEAN_R}`);
  const header = ['lane', 'pairs', 'coverage', 'msg_r', 'daily_r', 'cells', 'failed', 'verdict'];
  const rows = results.map(r => [
    r.version,
    String(r.metrics.pairCount),
    `${Math.round(r.metrics.coverage * 100)}%`,
    fmt(r.metrics.messageR),
    fmt(r.metrics.dailyMeanR),
    String(r.metrics.dailyCells),
    String(r.failedBatches),
    r.pass ? 'PASS' : 'FAIL',
  ]);
  const widths = header.map((h, i) => Math.max(h.length, ...rows.map(r => r[i]!.length)));
  const line = (cells: string[]) => cells.map((c, i) => c.padEnd(widths[i]!)).join('  ');
  console.log(line(header));
  for (const r of rows) console.log(line(r));
}
