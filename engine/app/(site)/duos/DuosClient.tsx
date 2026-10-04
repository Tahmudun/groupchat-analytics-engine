'use client';
import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import type { Episode } from '@/lib/flix/data';
import { EpisodeCard } from '../components/EpisodeCard';
import { MomentPlayer } from '../components/MomentPlayer';

type Member = { username: string; displayName: string };
type Pair = { reply: Episode; prompt: { id: string; content: string } };

export function DuosClient({ members }: { members: Member[] }) {
  const params = useSearchParams();
  const [a, setA] = useState(params.get('a') ?? '');
  const [b, setB] = useState(params.get('b') ?? '');
  const [pairs, setPairs] = useState<Pair[]>([]);
  const [loading, setLoading] = useState(false);
  const [ran, setRan] = useState(false);
  const [player, setPlayer] = useState<string | null>(null);

  const run = useCallback(async () => {
    if (!a || !b || a === b) return;
    setLoading(true);
    setRan(true);
    try {
      const res = await fetch(`/api/flix/duos?a=${encodeURIComponent(a)}&b=${encodeURIComponent(b)}`);
      const json = await res.json();
      setPairs((json.data ?? []) as Pair[]);
    } finally {
      setLoading(false);
    }
  }, [a, b]);

  // Auto-run when arriving with both prefilled (from a show page co-star link).
  useEffect(() => { if (a && b && a !== b) void run(); /* eslint-disable-next-line */ }, []);

  return (
    <div>
      <div className="flx-page-head">
        <h1 className="flx-display">Duos</h1>
        <p>Pick two members. See every time the second replied to the first.</p>
      </div>

      <div className="flx-pills" style={{ flexWrap: 'wrap' }}>
        <select className="flx-select" value={a} onChange={e => setA(e.target.value)} aria-label="First member">
          <option value="">Choose…</option>
          {members.map(m => <option key={m.username} value={m.username}>{m.displayName}</option>)}
        </select>
        <span style={{ alignSelf: 'center', color: 'var(--flx-muted)' }}>replied to by</span>
        <select className="flx-select" value={b} onChange={e => setB(e.target.value)} aria-label="Second member">
          <option value="">Choose…</option>
          {members.map(m => <option key={m.username} value={m.username}>{m.displayName}</option>)}
        </select>
        <button className="flx-btn danger" disabled={!a || !b || a === b || loading} onClick={() => void run()}>
          {loading ? 'Finding…' : 'Find scenes'}
        </button>
      </div>

      {ran && !loading && pairs.length === 0 && (
        <p className="flx-empty">No back-and-forth found for that pair. Try a different duo.</p>
      )}

      {pairs.length > 0 && (
        <section className="flx-section">
          <h2 style={{ padding: '0 var(--flx-gutter)', fontSize: '1.15rem', margin: '0 0 10px' }}>
            {pairs.length} scene{pairs.length === 1 ? '' : 's'}
          </h2>
          <div className="flx-episodes">
            {pairs.map(p => <EpisodeCard key={p.reply.id} episode={p.reply} onOpen={setPlayer} />)}
          </div>
        </section>
      )}

      {player && <MomentPlayer messageId={player} onClose={() => setPlayer(null)} />}
    </div>
  );
}
