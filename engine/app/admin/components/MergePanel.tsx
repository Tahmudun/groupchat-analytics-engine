'use client';
import { useCallback, useEffect, useState } from 'react';
import { apiJson, type StatusView } from '../client';
import { pipelinePercent } from '@/lib/admin/progress';

type Member = { username: string; display_name: string | null; message_count: number };
type Suggestion = {
  members: string[];
  similarity: number;
  suggestedCanonical: string;
  counts: Record<string, number>;
};
type Preview = {
  canonical: string;
  sources: string[];
  canonicalMessages: number;
  sourceMessages: Record<string, number>;
  duplicateMessages: number;
  totalAfter: number;
  reactionsReassigned: number;
  mentionsReassigned: number;
  sentimentsReassigned: number;
  scoreRowsDropped: number;
};

export function MergePanel(props: {
  chat: string;
  status: StatusView | null;
  refresh: () => Promise<void>;
  onError: (msg: string | null) => void;
}) {
  const { chat, status, refresh, onError } = props;
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [canonical, setCanonical] = useState<string | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [previewing, setPreviewing] = useState(false);

  const job = status?.job;
  const isMerge = job?.step === 'merge';
  const busy = job?.state === 'running';
  const prog = isMerge && job?.progress?.kind === 'pipeline' ? job.progress : null;
  const pct = prog ? pipelinePercent(prog) : null;

  const load = useCallback(async () => {
    try {
      const [sug, mem] = await Promise.all([
        apiJson<Suggestion[]>(`/api/admin/merge?chat=${encodeURIComponent(chat)}`),
        apiJson<Member[]>(`/api/admin/members?chat=${encodeURIComponent(chat)}`),
      ]);
      setSuggestions(sug);
      setMembers(mem);
    } catch (err) {
      onError(err instanceof Error ? err.message : String(err));
    }
  }, [chat, onError]);

  useEffect(() => { void load(); }, [load]);
  // Reload the members/suggestions once a merge job finishes (a member vanished).
  useEffect(() => { if (isMerge && job?.state === 'done') void load(); }, [isMerge, job?.state, load]);

  const nameOf = (u: string) => members.find(m => m.username === u)?.display_name ?? u;

  const toggle = (u: string) => {
    setPreview(null);
    setSelected(prev => {
      const next = prev.includes(u) ? prev.filter(x => x !== u) : [...prev, u];
      if (!next.includes(canonical ?? '')) setCanonical(next[0] ?? null);
      return next;
    });
  };

  const applySuggestion = (s: Suggestion) => {
    setPreview(null);
    setSelected(s.members);
    setCanonical(s.suggestedCanonical);
  };

  const clear = () => { setSelected([]); setCanonical(null); setPreview(null); };

  const sources = selected.filter(u => u !== canonical);
  const ready = canonical != null && sources.length >= 1;

  const doPreview = async () => {
    if (!ready) return;
    setPreviewing(true);
    try {
      const p = await apiJson<Preview>('/api/admin/merge', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ chat, canonical, sources, dryRun: true }),
      });
      setPreview(p);
      onError(null);
    } catch (err) {
      onError(err instanceof Error ? err.message : String(err));
    } finally {
      setPreviewing(false);
    }
  };

  const doMerge = async () => {
    if (!ready || !preview) return;
    if (!confirm(`Merge ${sources.length} member(s) into "${nameOf(canonical!)}"?\n\nThis removes ${preview.duplicateMessages.toLocaleString()} duplicate messages and reassigns everything else. It cannot be auto-undone.`)) return;
    try {
      await apiJson('/api/admin/merge', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ chat, canonical, sources }),
      });
      clear();
      onError(null);
      await refresh();
    } catch (err) {
      onError(err instanceof Error ? err.message : String(err));
    }
  };

  const q = search.trim().toLowerCase();
  const matches = q
    ? members.filter(m =>
        m.username.toLowerCase().includes(q) || (m.display_name ?? '').toLowerCase().includes(q))
        .slice(0, 12)
    : [];

  return (
    <section>
      <h2>merge members</h2>
      <p className="muted">
        Fold split accounts (same person, renamed on Instagram) into one show. Reassigns messages,
        reactions, mentions &amp; sentiment; removes duplicate messages; keeps the old name as an alias.
      </p>

      {suggestions.length > 0 && (
        <>
          <h3 className="sub">likely duplicates</h3>
          <ul className="merge-suggestions">
            {suggestions.map(s => {
              const [a, b] = s.members as [string, string];
              return (
                <li key={s.members.join('|')}>
                  <span>
                    <b>{nameOf(a)}</b> <span className="muted">↔</span> <b>{nameOf(b)}</b>
                    {' '}<span className="muted">sim {s.similarity} · {(s.counts[a] ?? 0).toLocaleString()} / {(s.counts[b] ?? 0).toLocaleString()} msgs</span>
                  </span>
                  <button onClick={() => applySuggestion(s)}>select</button>
                </li>
              );
            })}
          </ul>
        </>
      )}

      <h3 className="sub">add members manually</h3>
      <div className="row">
        <input placeholder="search name…" value={search} onChange={e => setSearch(e.target.value)} />
      </div>
      {matches.length > 0 && (
        <ul className="merge-matches">
          {matches.map(m => (
            <li key={m.username}>
              <button onClick={() => { toggle(m.username); setSearch(''); }} disabled={selected.includes(m.username)}>
                + {m.display_name ?? m.username} <span className="muted">{m.message_count.toLocaleString()} msgs</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {selected.length > 0 && (
        <div className="merge-selection">
          <h3 className="sub">merging {selected.length} — pick the canonical show</h3>
          <ul>
            {selected.map(u => (
              <li key={u}>
                <label>
                  <input type="radio" name="canonical" checked={canonical === u} onChange={() => { setCanonical(u); setPreview(null); }} />
                  {' '}<b>{nameOf(u)}</b>{canonical === u && <span className="muted"> (keep)</span>}
                </label>
                <button className="x" onClick={() => toggle(u)}>×</button>
              </li>
            ))}
          </ul>
          <div className="row">
            <button disabled={!ready || previewing || busy} onClick={() => void doPreview()}>
              {previewing ? 'previewing…' : 'preview'}
            </button>
            <button onClick={clear}>clear</button>
          </div>
        </div>
      )}

      {preview && (
        <div className="banner warn merge-preview">
          <b>{nameOf(preview.canonical)}</b> will have <b>{preview.totalAfter.toLocaleString()}</b> messages
          {' '}(was {preview.canonicalMessages.toLocaleString()}).
          <ul>
            <li>{preview.duplicateMessages.toLocaleString()} duplicate messages removed</li>
            <li>{preview.reactionsReassigned.toLocaleString()} reactions · {preview.mentionsReassigned.toLocaleString()} mentions · {preview.sentimentsReassigned.toLocaleString()} sentiments reassigned</li>
            <li>{preview.scoreRowsDropped.toLocaleString()} stale score rows dropped — <b>recompute scores after</b></li>
          </ul>
          <button className="primary" disabled={busy} onClick={() => void doMerge()}>run merge</button>
        </div>
      )}

      {isMerge && job?.state === 'running' && (
        <div className="progress" style={{ marginTop: 12 }}>
          <div className="name"><b>merge</b><span>{prog?.label ?? 'starting…'}</span></div>
          <div className="pbar"><div className="fill" style={{ width: `${pct ?? 100}%`, opacity: pct == null ? 0.5 : 1 }} /></div>
          <div className="counts"><span>{prog ? prog.done.toLocaleString() : 0}{prog?.total ? ` / ${prog.total.toLocaleString()}` : ''}</span><span>{pct == null ? 'working…' : `${pct}%`}</span></div>
        </div>
      )}
      {isMerge && job?.state === 'done' && (
        <p className="job done">merge finished: <code>{JSON.stringify(job.result)}</code> — now hit <b>Recompute scores</b>.</p>
      )}
      {isMerge && job?.state === 'error' && (
        <p className="job error">merge FAILED: {job.error}</p>
      )}
    </section>
  );
}
