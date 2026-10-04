import { z } from 'zod';
import { requireAdmin } from '@/lib/admin/guard';
import { startJob, type JobProgress } from '@/lib/admin/jobs';
import { ok, fail } from '@/lib/api/respond';
import { sql } from '@/lib/db/client';
import { extractMentions, type SentimentReport } from '@/lib/sentiment/run';
import { loadProvidersConfig, buildLanes } from '@/lib/providers/config';
import { runDispatcher } from '@/lib/dispatch/dispatcher';
import { startMonitor } from '@/lib/dispatch/monitor';
import { computeScores } from '@/lib/scoring/compute';

type SetProgress = (p: JobProgress) => void;

const BodySchema = z.object({
  chat: z.string().min(1),
  step: z.enum(['mentions', 'sentiment', 'scores', 'recap']),
});

async function runMentions(chat: string, setProgress: SetProgress): Promise<unknown> {
  const [row] = await sql`
    SELECT count(*)::int AS total FROM messages
    WHERE chat_id = ${chat} AND message_type = 'message' AND content <> ''`;
  const total = (row?.total as number) ?? 0;
  const report: SentimentReport = { scanned: 0, mentionMessages: 0, classified: 0, cached: 0, failed: 0 };
  // extractMentions mutates `report` as it pages; poll it for a live bar.
  const tick = setInterval(() => setProgress({
    kind: 'pipeline', done: report.scanned, total,
    label: `${report.mentionMessages.toLocaleString()} mention messages so far`,
  }), 1000);
  try {
    await extractMentions(chat, report);
  } finally {
    clearInterval(tick);
  }
  return { scanned: report.scanned, mentionMessages: report.mentionMessages };
}

async function runSentiment(chat: string, setProgress: SetProgress): Promise<unknown> {
  const config = await loadProvidersConfig();
  const { lanes, skipped } = await buildLanes(config);
  if (lanes.length === 0) {
    throw new Error(`no lanes available (${skipped.map(s => `${s.id}: ${s.reason}`).join('; ') || 'none configured'})`);
  }
  const [pendingRow] = await sql`
    SELECT count(DISTINCT mm.message_id)::int AS total
    FROM message_mentions mm
    WHERE mm.chat_id = ${chat}
      AND NOT EXISTS (
        SELECT 1 FROM mention_sentiments s
        WHERE s.message_id = mm.message_id AND s.member_username = mm.member_username)`;
  const total = (pendingRow?.total as number) ?? 0;

  const handle = runDispatcher(chat, lanes, {});
  const stopMonitor = await startMonitor(chat, handle);
  const tick = setInterval(() => {
    const done = handle.lanes.reduce((n, l) => n + l.stats.messagesDone + l.stats.drained, 0);
    const label = handle.lanes.map(l => `${l.stats.id} ✓${l.stats.messagesDone}`).join(' · ');
    setProgress({ kind: 'pipeline', done, total: total || null, label });
  }, 2000);
  try {
    await handle.done;
  } finally {
    clearInterval(tick);
    stopMonitor();
  }
  const laneStats = handle.lanes.map(({ stats }) => stats);

  // Freshness chain: new sentiment → recompute scores (which refreshes
  // weekly_stats), so the site reflects the run with no extra button press.
  setProgress({ kind: 'pipeline', done: total || 1, total: total || null, label: 'recomputing scores…' });
  const scores = await computeScores(chat, {
    onProgress: p => setProgress({
      kind: 'pipeline', done: p.windowsDone, total: p.windowsTotal,
      label: `scores: ${p.rowsWritten.toLocaleString()} rows`,
    }),
  });
  return { lanes: laneStats, scores };
}

async function runScores(chat: string, setProgress: SetProgress): Promise<unknown> {
  return computeScores(chat, {
    onProgress: p => setProgress({
      kind: 'pipeline', done: p.windowsDone, total: p.windowsTotal,
      label: `${p.rowsWritten.toLocaleString()} rows written`,
    }),
  });
}

async function runRecap(chat: string, setProgress: SetProgress): Promise<unknown> {
  const { computeRecap } = await import('@/lib/recap/compute');
  return computeRecap(chat, {
    onProgress: p => setProgress({ kind: 'pipeline', done: p.done, total: p.total, label: p.label }),
  });
}

function makeRunner(chat: string, step: z.infer<typeof BodySchema>['step']): (setProgress: SetProgress) => Promise<unknown> {
  switch (step) {
    case 'mentions': return setProgress => runMentions(chat, setProgress);
    case 'sentiment': return setProgress => runSentiment(chat, setProgress);
    case 'scores': return setProgress => runScores(chat, setProgress);
    case 'recap': return setProgress => runRecap(chat, setProgress);
  }
}

export async function POST(req: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail(400, 'bad_request', parsed.error.issues.map(i => i.message).join('; '));
  const { chat, step } = parsed.data;

  const started = startJob(step, makeRunner(chat, step));
  if (!started.ok) return fail(409, 'job_running', `a '${started.busy.step}' job is already running (started ${started.busy.startedAt})`);
  return ok({ started: step });
}
