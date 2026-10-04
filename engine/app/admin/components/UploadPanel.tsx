'use client';
import { useRef, useState } from 'react';
import { xhrUpload, type StatusView } from '../client';
import { ingestPercent } from '@/lib/admin/progress';

type IngestResult = {
  dir: string;
  report: { parsed: number; inserted: number; deduped: number; reactionsInserted: number };
  took_ms: number;
};

export function UploadPanel(props: {
  chat: string;
  status: StatusView | null;
  refresh: () => Promise<void>;
  onError: (msg: string | null) => void;
}) {
  const { chat, status, refresh, onError } = props;
  const [uploadPct, setUploadPct] = useState<number | null>(null); // non-null while phase 1 (browser→server) runs
  const [batch, setBatch] = useState<string | null>(null);
  const [drag, setDrag] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const job = status?.job?.step === 'ingest' ? status.job : null;
  const ingesting = job?.state === 'running';
  const uploading = uploadPct !== null;
  const busy = uploading || status?.job?.state === 'running';

  const send = async (files: FileList | null) => {
    if (!files || files.length === 0 || busy) return;
    setUploadPct(0);
    setBatch(`${files.length} file${files.length === 1 ? '' : 's'}`);
    try {
      const form = new FormData();
      form.set('chat', chat);
      for (const f of Array.from(files)) form.append('files', f);
      await xhrUpload('/api/admin/upload', form, setUploadPct);
      onError(null);
      await refresh(); // sees the running ingest job → page switches to 1s polling
    } catch (err) {
      onError(err instanceof Error ? err.message : String(err));
    } finally {
      setUploadPct(null);
      if (input.current) input.current.value = '';
    }
  };

  // An ingest job only ever carries ingest-shaped progress; narrow off the union.
  const ip = job?.progress && job.progress.kind !== 'pipeline' ? job.progress : undefined;
  const pct = uploading ? uploadPct : ingesting ? ingestPercent(ip) : 0;
  const phase = uploading ? 'uploading' : ip?.phase === 'finalizing' ? 'stats' : 'ingesting';
  const finalizing = ip?.phase === 'finalizing';
  const done = job?.state === 'done';
  const result = done ? (job?.result as IngestResult) : null;

  const dots = uploading
    ? [
        { label: 'upload', cls: 'now' },
        { label: 'validate', cls: '' },
        { label: 'ingest', cls: '' },
        { label: 'stats', cls: '' },
      ]
    : [
        { label: '✓ upload', cls: 'done' },
        { label: '✓ validate', cls: 'done' },
        { label: finalizing || done ? '✓ ingest' : 'ingest', cls: finalizing || done ? 'done' : 'now' },
        { label: done ? '✓ stats' : 'stats', cls: done ? 'done' : finalizing ? 'now' : '' },
      ];

  return (
    <section>
      <h2>upload export</h2>
      {!uploading && !ingesting && (
        <div
          className={`dropzone${busy ? ' busy' : ''}${drag ? ' drag' : ''}`}
          onDragOver={e => { e.preventDefault(); setDrag(true); }}
          onDragLeave={() => setDrag(false)}
          onDrop={e => { e.preventDefault(); setDrag(false); void send(e.dataTransfer.files); }}
          onClick={() => { if (!busy) input.current?.click(); }}
        >
          {busy ? 'a job is running — wait for it to finish' : 'drop message_*.json files (or a .zip) here, or click to pick'}
          <input ref={input} type="file" multiple accept=".json,.zip" hidden onChange={e => void send(e.target.files)} />
        </div>
      )}
      {(uploading || ingesting) && (
        <div className="progress">
          <div className="name"><b>{batch ?? 'export'}</b><span>{phase}</span></div>
          <div className="pbar"><div className="fill" style={{ width: `${pct ?? 0}%` }} /></div>
          <div className="counts">
            <span><b>{(ip?.parsed ?? 0).toLocaleString()}</b> parsed</span>
            <span><b>{(ip?.inserted ?? 0).toLocaleString()}</b> new</span>
            <span><b>{pct ?? 0}%</b></span>
          </div>
          <div className="steps">
            {dots.map((d, i) => <div key={i} className={`step ${d.cls}`}>{d.label}</div>)}
          </div>
        </div>
      )}
      {result && (
        <p className="job done">
          saved to <code>{result.dir}</code> — <strong>{result.report.inserted.toLocaleString()} new</strong>,{' '}
          {result.report.deduped.toLocaleString()} duplicates skipped, {result.report.reactionsInserted.toLocaleString()} reactions,{' '}
          {(result.took_ms / 1000).toFixed(1)}s
        </p>
      )}
      {job?.state === 'error' && <p className="job error">ingest FAILED: {job.error}</p>}
    </section>
  );
}
