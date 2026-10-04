import { sql } from '@/lib/db/client';
import { withDbRetry } from '@/lib/sentiment/run';
import type { DispatcherHandle } from './dispatcher';
import type { WorkScope } from './queue';

export const MONITOR_INTERVAL_MS = 30_000;

async function countRemaining(chatId: string, scope: WorkScope = {}): Promise<number> {
  const modelVersion = scope.modelVersion ?? null;
  const newMessagesSince = scope.newMessagesSince ?? null;
  const aliasesSince = scope.aliasesSince ?? null;
  const retryDrains = scope.retryDrains ?? false;
  const drainsOnly = scope.drainsOnly ?? false;
  const [row] = await withDbRetry(() => sql`
    SELECT count(DISTINCT mm.message_id)::int AS n
    FROM message_mentions mm
    JOIN messages m ON m.id = mm.message_id
    WHERE mm.chat_id = ${chatId}
      AND (
        (${modelVersion}::text IS NULL AND NOT EXISTS (
          SELECT 1 FROM mention_sentiments s
          WHERE s.message_id = mm.message_id AND s.member_username = mm.member_username
        ))
        OR
        (${modelVersion}::text IS NOT NULL AND (
          (${drainsOnly} AND EXISTS (
            SELECT 1 FROM mention_sentiments s
            WHERE s.message_id = mm.message_id AND s.member_username = mm.member_username
              AND s.model_version = ${modelVersion} AND s.confidence = 0
          ))
          OR
          (${!drainsOnly} AND NOT EXISTS (
            SELECT 1 FROM mention_sentiments s
            WHERE s.message_id = mm.message_id AND s.member_username = mm.member_username
              AND s.model_version = ${modelVersion}
              AND (${!retryDrains} OR s.confidence > 0)
          ))
        ))
      )
      AND (
        (${newMessagesSince}::timestamptz IS NULL AND ${aliasesSince}::timestamptz IS NULL)
        OR (${newMessagesSince}::timestamptz IS NOT NULL AND m.timestamp >= ${newMessagesSince})
        OR (${aliasesSince}::timestamptz IS NOT NULL AND EXISTS (
          SELECT 1 FROM member_aliases ma
          WHERE ma.chat_id = mm.chat_id
            AND ma.member_username = mm.member_username
            AND lower(ma.alias) = lower(mm.alias_matched)
            AND ma.created_at >= ${aliasesSince}
        ))
      )`);
  return (row?.n as number) ?? 0;
}

function fmtBudget(used: number, budget: number | null): string {
  return budget === null ? `${used} tok` : `${used}/${budget} tok (${Math.round((used / budget) * 100)}%)`;
}

function laneState(l: DispatcherHandle['lanes'][number]): string {
  const snap = l.limiter.snapshot();
  if (snap.waitingForMidnight) return 'daily budget spent — waiting for UTC midnight';
  if (snap.pausedUntil !== null) return `backoff until ${new Date(snap.pausedUntil).toISOString().slice(11, 19)}Z`;
  return 'running';
}

/** Per-lane + global progress every 30s. Returns a stop function. */
export async function startMonitor(
  chatId: string,
  handle: DispatcherHandle,
  ensembleScope?: Omit<WorkScope, 'modelVersion'>,
): Promise<() => void> {
  const initialByVersion = new Map<string, number>();
  if (ensembleScope) {
    // Keep these sequential: four small indexed counts are kinder to Nano
    // than making the free-tier database serve them concurrently.
    for (const lane of handle.lanes) {
      initialByVersion.set(lane.stats.version, await countRemaining(chatId, {
        ...ensembleScope,
        modelVersion: lane.stats.version,
      }));
    }
  } else {
    initialByVersion.set('shared', await countRemaining(chatId));
  }
  const initialRemaining = [...initialByVersion.values()].reduce((n, x) => n + x, 0);
  const startedAt = Date.now();
  console.log(`monitor: ${initialRemaining} ${ensembleScope ? 'provider-message assignments' : 'mention-messages'} pending`);
  if (ensembleScope) {
    for (const lane of handle.lanes) {
      console.log(`  [${lane.stats.id}] ${initialByVersion.get(lane.stats.version) ?? 0} messages missing ${lane.stats.version}`);
    }
  }

  const timer = setInterval(() => {
    const classified = handle.lanes.reduce((n, l) => n + l.stats.messagesDone, 0);
    const remaining = Math.max(0, initialRemaining - classified);
    const elapsedMin = (Date.now() - startedAt) / 60_000;
    const rate = classified / Math.max(elapsedMin, 0.01); // msgs/min
    const etaMin = rate > 0 ? remaining / rate : Infinity;

    const stamp = new Date().toISOString().slice(11, 19);
    console.log(`── progress ${stamp}Z ──`);
    for (const l of handle.lanes) {
      const snap = l.limiter.snapshot();
      const s = l.stats;
      const issues = s.failedRetriable > 0 || s.drained > 0 ? `, ${s.failedRetriable} failed-retriable / ${s.drained} drained` : '';
      const laneTotal = ensembleScope ? initialByVersion.get(s.version) : undefined;
      const laneProgress = laneTotal === undefined ? `${s.messagesDone} msgs` : `${s.messagesDone}/${laneTotal} msgs`;
      console.log(`  [${s.id}] ${s.batchesDone} batches (${laneProgress}${issues}) — ${fmtBudget(snap.tokensToday, snap.dailyTokenBudget)} today — ${laneState(l)}`);
    }
    console.log(`  [all] classified ${classified} / remaining ~${remaining} — ${rate.toFixed(1)} msg/min, ETA ${Number.isFinite(etaMin) && remaining > 0 ? `${(etaMin / 60).toFixed(1)}h` : remaining === 0 ? 'done' : 'n/a'}`);
  }, MONITOR_INTERVAL_MS);
  timer.unref();
  return () => clearInterval(timer);
}
