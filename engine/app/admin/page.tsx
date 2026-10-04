'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import './admin.css';
import '../artframe.css';
import { apiJson, type StatusView } from './client';
import { PipelinePanel } from './components/PipelinePanel';
import { UploadPanel } from './components/UploadPanel';
import { MembersPanel } from './components/MembersPanel';
import { MergePanel } from './components/MergePanel';
import { StatsStrip } from './components/StatsStrip';
import { ShowsPanel } from './components/ShowsPanel';
import { CategoriesPanel } from './components/CategoriesPanel';

export default function AdminPage() {
  const [chat, setChat] = useState('flix-original');
  const [status, setStatus] = useState<StatusView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const requestSeq = useRef(0);

  const refresh = useCallback(async () => {
    const seq = ++requestSeq.current;
    try {
      const next = await apiJson<StatusView>(`/api/admin/status?chat=${encodeURIComponent(chat)}`);
      if (seq !== requestSeq.current) return; // a newer request superseded this one
      setStatus(next);
      setError(null);
    } catch (err) {
      if (seq !== requestSeq.current) return;
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [chat]);

  useEffect(() => { void refresh(); }, [refresh]);

  // Poll while a job runs: 1s for ingest (drives the progress bar), 5s otherwise.
  useEffect(() => {
    if (status?.job?.state !== 'running') return;
    const t = setInterval(() => void refresh(), status?.job?.step === 'ingest' ? 1000 : 5000);
    return () => clearInterval(t);
  }, [status?.job?.state, status?.job?.step, refresh]);

  return (
    <main className="admin">
      <header>
        <div>
          <div className="kicker">FLIX</div>
          <h1>admin</h1>
        </div>
        <label className="chat-picker">
          <select value={chat} onChange={e => setChat(e.target.value)}>
            {(status?.chats ?? [{ id: chat }]).map(c => (
              <option key={c.id} value={c.id}>{c.id}</option>
            ))}
          </select>
        </label>
      </header>
      <div className="content">
        {error && <div className="banner error">{error}</div>}
        <StatsStrip coverage={status?.coverage ?? null} />
        <UploadPanel chat={chat} status={status} refresh={refresh} onError={setError} />
        <PipelinePanel chat={chat} status={status} refresh={refresh} onError={setError} />
        <ShowsPanel chat={chat} onError={setError} />
        <CategoriesPanel chat={chat} onError={setError} />
        <MembersPanel chat={chat} onError={setError} />
        <MergePanel chat={chat} status={status} refresh={refresh} onError={setError} />
      </div>
    </main>
  );
}
