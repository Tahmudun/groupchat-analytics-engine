'use client';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import type { Episode } from '@/lib/flix/data';
import { Pfp } from '../components/Avatars';
import { EpisodeCard } from '../components/EpisodeCard';
import { MomentPlayer } from '../components/MomentPlayer';

type CastMember = { sender: string; n: number };

export function RewindClient() {
  const search = useSearchParams();
  const [when, setWhen] = useState('');
  const [cast, setCast] = useState<CastMember[]>([]);
  const [messages, setMessages] = useState<Episode[]>([]);
  const [loading, setLoading] = useState(false);
  const [ran, setRan] = useState(false);
  const [player, setPlayer] = useState<string | null>(null);

  const run = async (at?: string) => {
    const target = at ?? when;
    if (!target) return;
    setLoading(true);
    setRan(true);
    try {
      const iso = new Date(target).toISOString();
      const res = await fetch(`/api/flix/rewind?t=${encodeURIComponent(iso)}&hours=3`);
      const json = await res.json();
      setCast((json.data?.cast ?? []) as CastMember[]);
      setMessages((json.data?.messages ?? []) as Episode[]);
    } finally {
      setLoading(false);
    }
  };

  // Deep-link support for Recap cards: /rewind?at=2026-03-14T20:00 lands
  // pre-loaded instead of waiting on the picker.
  useEffect(() => {
    const at = search.get('at');
    if (at) { setWhen(at); void run(at); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div>
      <div className="flx-page-head">
        <h1 className="flx-display">Rewind</h1>
        <p>Pick a moment. See who was awake and what was said in the ±3 hours around it.</p>
      </div>

      <div className="flx-pills" style={{ flexWrap: 'wrap' }}>
        <input className="flx-input" type="datetime-local" value={when} onChange={e => setWhen(e.target.value)} aria-label="Moment" />
        <button className="flx-btn danger" disabled={!when || loading} onClick={() => void run()}>
          {loading ? 'Rewinding…' : 'Play from here'}
        </button>
      </div>

      {cast.length > 0 && (
        <section className="flx-section">
          <h2 style={{ padding: '0 var(--flx-gutter)', fontSize: '1.15rem', margin: '0 0 10px' }}>The cast that night</h2>
          <div className="flx-row">
            {cast.map(c => (
              <div key={c.sender} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, width: 76, flex: 'none' }}>
                <Pfp name={c.sender} size={56} />
                <span style={{ fontSize: '0.68rem', color: 'var(--flx-muted)', textAlign: 'center', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 76 }}>{c.sender}</span>
                <span style={{ fontSize: '0.62rem', color: 'var(--flx-faint)' }}>{c.n} msgs</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {messages.length > 0 && (
        <section className="flx-section">
          <h2 style={{ padding: '0 var(--flx-gutter)', fontSize: '1.15rem', margin: '0 0 10px' }}>{messages.length} messages</h2>
          <div className="flx-episodes">
            {messages.slice(0, 60).map(m => <EpisodeCard key={m.id} episode={m} onOpen={setPlayer} />)}
          </div>
        </section>
      )}

      {ran && !loading && messages.length === 0 && (
        <p className="flx-empty">Nothing happened around then. Try another moment.</p>
      )}

      {player && <MomentPlayer messageId={player} onClose={() => setPlayer(null)} />}
    </div>
  );
}
