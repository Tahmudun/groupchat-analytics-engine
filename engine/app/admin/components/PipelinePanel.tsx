'use client';
import { apiJson, type StatusView } from '../client';
import { pipelinePercent } from '@/lib/admin/progress';

const STEPS = [
  { step: 'mentions', label: 'Run mentions', hint: 'extract @-mentions (picks up new aliases)' },
  { step: 'sentiment', label: 'Run sentiment', hint: 'LLM dispatch across provider lanes, then recompute scores (long)' },
  { step: 'scores', label: 'Recompute scores', hint: 'daily member score time series → refreshes the site' },
  { step: 'recap', label: 'Recap', hint: 'Rebuild the per-member Recap stat blobs' },
] as const;

export function PipelinePanel(props: {
  chat: string;
  status: StatusView | null;
  refresh: () => Promise<void>;
  onError: (msg: string | null) => void;
}) {
  const { chat, status, refresh, onError } = props;
  const job = status?.job;
  const busy = job?.state === 'running';
  const isPipeline = job != null && ['mentions', 'sentiment', 'scores', 'recap'].includes(job.step);
  const prog = isPipeline && job?.progress?.kind === 'pipeline' ? job.progress : null;
  const pct = prog ? pipelinePercent(prog) : null;

  const start = async (step: string) => {
    try {
      await apiJson(`/api/admin/pipeline`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ chat, step }),
      });
      onError(null);
      await refresh();
    } catch (err) {
      onError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <section>
      <h2>pipeline</h2>
      <div className="row">
        {STEPS.map(s => (
          <button key={s.step} className="primary" disabled={busy} title={s.hint} onClick={() => void start(s.step)}>
            {s.label}
          </button>
        ))}
      </div>

      {isPipeline && job?.state === 'running' && (
        <div className="progress" style={{ marginTop: 12 }}>
          <div className="name">
            <b>{job.step}</b>
            <span>{prog?.label ?? 'starting…'}</span>
          </div>
          <div className="pbar">
            <div className="fill" style={{ width: `${pct ?? 100}%`, opacity: pct == null ? 0.5 : 1 }} />
          </div>
          <div className="counts">
            <span><b>{prog ? prog.done.toLocaleString() : 0}</b>{prog?.total ? ` / ${prog.total.toLocaleString()}` : ''} done</span>
            <span>{pct == null ? 'working…' : `${pct}%`}</span>
          </div>
        </div>
      )}

      {isPipeline && job?.state === 'done' && (
        <p className="job done">last job <strong>{job.step}</strong> finished: <code>{JSON.stringify(job.result)}</code></p>
      )}
      {isPipeline && job?.state === 'error' && (
        <p className="job error">last job <strong>{job.step}</strong> FAILED: {job.error}</p>
      )}
    </section>
  );
}
