/**
 * One-at-a-time in-process job registry for the admin page. The admin
 * surface only runs in a local single-instance `next dev` server, so a
 * single shared registry is safe — but `next dev`'s HMR re-evaluates this
 * module on every edit, which would reset a plain module-level `let` to
 * null while an orphaned job keeps running in the background (risk:
 * concurrent sentiment dispatchers). To survive that, state is stashed on
 * `globalThis` (same pattern as the canonical Prisma dev singleton) so it
 * outlives module re-evaluation. The last finished job stays visible until
 * the next start.
 */
export type JobStep = 'ingest' | 'mentions' | 'sentiment' | 'scores' | 'merge' | 'recap';

/** Ingest progress (byte-estimated parse bar). `kind` optional for back-compat
 *  with the upload runner, which predates the union. */
export type IngestJobProgress = {
  kind?: 'ingest';
  phase: 'parsing' | 'finalizing';
  parsed: number;
  inserted: number;
  estimatedTotal?: number;
};

/** Determinate progress for the mentions/sentiment/scores pipeline steps.
 *  total is null while the step can't yet bound its work (indeterminate bar). */
export type PipelineJobProgress = {
  kind: 'pipeline';
  done: number;
  total: number | null;
  label: string;
};

export type JobProgress = IngestJobProgress | PipelineJobProgress;

export type JobState = {
  step: JobStep;
  startedAt: string;
  state: 'running' | 'done' | 'error';
  finishedAt?: string;
  result?: unknown;
  error?: string;
  progress?: JobProgress;
};

// Dev-server HMR re-evaluates this module on edits; stash state on globalThis
// so a running job survives (same pattern as the canonical Prisma dev singleton).
const store = ((globalThis as Record<string, unknown>).__wrappedAdminJobs ??= { job: null }) as { job: JobState | null };

export function currentJob(): JobState | null {
  return store.job;
}

export function startJob(
  step: JobStep,
  runner: (setProgress: (p: JobProgress) => void) => Promise<unknown>,
): { ok: true } | { ok: false; busy: JobState } {
  if (store.job?.state === 'running') return { ok: false, busy: store.job };
  const state: JobState = { step, startedAt: new Date().toISOString(), state: 'running' };
  store.job = state;
  // Progress from a stale runner (job already settled) must not resurface.
  const setProgress = (p: JobProgress) => { if (state.state === 'running') state.progress = p; };
  Promise.resolve()
    .then(() => runner(setProgress))
    .then(
      result => { state.state = 'done'; state.result = result; state.finishedAt = new Date().toISOString(); },
      err => { state.state = 'error'; state.error = err instanceof Error ? err.message : String(err); state.finishedAt = new Date().toISOString(); },
    );
  return { ok: true };
}

/** Test-only. */
export function _resetJobs(): void {
  store.job = null;
}
