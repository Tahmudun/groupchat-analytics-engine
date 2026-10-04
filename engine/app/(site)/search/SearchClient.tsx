'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import type { Episode } from '@/lib/flix/data';
import { EpisodeCard } from '../components/EpisodeCard';
import { MomentPlayer } from '../components/MomentPlayer';
import type { MemberSearchCard } from '@/lib/flix/data';
import { PosterCard } from '../components/PosterCard';

type Mode = 'shows' | 'episodes';

type Result = { id: string; sender: string; sent_at: string; content: string; media_type: string | null; reaction_count: number };
type SortKey = 'newest' | 'oldest' | 'relevance' | 'most_reactions';

const toEpisode = (r: Result): Episode => ({
  id: r.id, sender: r.sender, sentAt: r.sent_at, content: r.content,
  mediaType: r.media_type, reactionCount: r.reaction_count,
});

const SORTS: Array<{ key: SortKey; label: string }> = [
  { key: 'newest', label: 'Newest' },
  { key: 'oldest', label: 'Oldest' },
  { key: 'relevance', label: 'Relevance' },
  { key: 'most_reactions', label: 'Most reactions' },
];

export function SearchClient({ senders, topMembers }: { senders: string[]; topMembers: MemberSearchCard[] }) {
  const params = useSearchParams();
  const [query, setQuery] = useState('');
  const [sender, setSender] = useState('');
  const [sort, setSort] = useState<SortKey>('newest');
  const [hasMedia, setHasMedia] = useState(false);
  const [results, setResults] = useState<Result[]>([]);
  const [top, setTop] = useState<Result[]>([]);
  const [total, setTotal] = useState(0);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [player, setPlayer] = useState<string | null>(params.get('play'));
  const seq = useRef(0);
  const [mode, setMode] = useState<Mode>('shows');
  const [members, setMembers] = useState<MemberSearchCard[]>([]);
  const [memberLoading, setMemberLoading] = useState(false);
  const memberSeq = useRef(0);

  const hasCriteria = Boolean(query.trim() || sender || hasMedia);

  const run = useCallback(async (append: boolean, cur: string | null) => {
    const mySeq = ++seq.current;
    setLoading(true);
    try {
      const filters = { ...(sender ? { sender } : {}), ...(hasMedia ? { has_media: true } : {}) };
      const body = {
        query: query.trim() || undefined,
        filters: Object.keys(filters).length ? filters : undefined,
        sort,
        limit: 25,
        cursor: append ? cur : null,
      };
      const res = await fetch('/api/flix/search', {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
      });
      const json = await res.json();
      if (mySeq !== seq.current) return; // superseded
      const data = (json.data ?? []) as Result[];
      setResults(prev => (append ? [...prev, ...data] : data));
      setTotal(json.meta?.total ?? 0);
      setCursor(json.meta?.next_cursor ?? null);
      if (!append) setTop((json.meta?.top ?? []) as Result[]);
    } finally {
      if (mySeq === seq.current) setLoading(false);
    }
  }, [query, sender, sort, hasMedia]);

  // Debounced as-you-type. An empty search shows the browse promos rather than
  // dumping all 900k messages, so only query when there's something to match.
  useEffect(() => {
    if (mode !== 'episodes' || !hasCriteria) {
      ++seq.current;
      setResults([]); setTop([]); setTotal(0); setCursor(null); setLoading(false);
      return;
    }
    const t = setTimeout(() => void run(false, null), 300);
    return () => clearTimeout(t);
  }, [run, hasCriteria, mode]);

  // Shows mode: debounced member search. Empty query = the Top searches grid.
  useEffect(() => {
    if (mode !== 'shows') return;
    const q = query.trim();
    if (!q) {
      ++memberSeq.current;
      setMembers([]); setMemberLoading(false);
      return;
    }
    const mySeq = ++memberSeq.current;
    setMemberLoading(true);
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/flix/members/search?q=${encodeURIComponent(q)}`);
        if (!res.ok) return; // auth/server error: keep current grid, don't fake "no matches"
        const json = await res.json();
        if (mySeq !== memberSeq.current) return; // superseded
        setMembers((json.data ?? []) as MemberSearchCard[]);
      } catch {
        // network hiccup: keep what's shown; the next keystroke retries
      } finally {
        if (mySeq === memberSeq.current) setMemberLoading(false);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [mode, query]);

  return (
    <div style={{ paddingTop: 68 }}>
      <div style={{ padding: '10px var(--flx-gutter)' }}>
        <input
          className="flx-input"
          style={{ width: '100%' }}
          autoFocus
          placeholder="Search shows, episodes, moments…"
          value={query}
          onChange={e => setQuery(e.target.value)}
        />
      </div>

      <div className="flx-pills" role="tablist" aria-label="Search mode">
        <button role="tab" aria-selected={mode === 'shows'} className={`flx-pill${mode === 'shows' ? ' on' : ''}`} onClick={() => setMode('shows')}>Shows</button>
        <button role="tab" aria-selected={mode === 'episodes'} className={`flx-pill${mode === 'episodes' ? ' on' : ''}`} onClick={() => setMode('episodes')}>Episodes</button>
      </div>

      {mode === 'shows' && (() => {
        const q = query.trim();
        const grid = q ? members : topMembers;
        return (
          <section className="flx-section">
            <h2 style={{ padding: '0 var(--flx-gutter)', fontSize: '1.15rem', margin: '0 0 10px' }}>
              {q ? `Shows matching “${q}”` : 'Top searches'}
            </h2>
            {grid.length > 0 && (
              <div className="flx-search-grid">
                {grid.map(m => (
                  <PosterCard
                    key={m.username}
                    href={`/member/${encodeURIComponent(m.username)}`}
                    title={m.displayName}
                    art={m.art}
                    preset={m.preset}
                    seed={m.username}
                  />
                ))}
              </div>
            )}
            {q.length > 0 && grid.length === 0 && !memberLoading && (
              <p className="flx-empty">No shows match that. Try a nickname or IG handle.</p>
            )}
          </section>
        );
      })()}

      {mode === 'episodes' && (<>
      <div className="flx-pills">
        <select className="flx-select" value={sender} onChange={e => setSender(e.target.value)} aria-label="Sender">
          <option value="">Anyone</option>
          {senders.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <button className={`flx-pill${hasMedia ? ' on' : ''}`} onClick={() => setHasMedia(v => !v)}>📷 Media</button>
        {SORTS.map(s => (
          <button key={s.key} className={`flx-pill${sort === s.key ? ' on' : ''}`} onClick={() => setSort(s.key)}>{s.label}</button>
        ))}
      </div>

      {!hasCriteria && results.length === 0 && !loading && (
        <div className="flx-section">
          <div className="flx-promos">
            <Link className="flx-promo" href="/duos" style={{ background: 'linear-gradient(135deg,#3c096c,#7b2ff7)' }}>
              <h3 className="flx-display">Duos</h3><p>See when two members played off each other.</p>
            </Link>
            <Link className="flx-promo" href="/rewind" style={{ background: 'linear-gradient(135deg,#7a0c14,#e50914)' }}>
              <h3 className="flx-display">Rewind</h3><p>Jump to any night and see who was awake.</p>
            </Link>
          </div>
        </div>
      )}

      {top.length > 0 && (
        <section className="flx-section">
          <h2 style={{ padding: '0 var(--flx-gutter)', fontSize: '1.15rem', margin: '0 0 10px' }}>
            Top 10 for “{query.trim() || (sender || 'media')}”
          </h2>
          <div className="flx-row">
            {top.map(r => (
              <div key={r.id} style={{ width: 300, flex: 'none' }}>
                <EpisodeCard episode={toEpisode(r)} onOpen={setPlayer} />
              </div>
            ))}
          </div>
        </section>
      )}

      {results.length > 0 && (
        <section className="flx-section">
          <h2 style={{ padding: '0 var(--flx-gutter)', fontSize: '1.15rem', margin: '0 0 10px' }}>
            {total.toLocaleString()} result{total === 1 ? '' : 's'}
          </h2>
          <div className="flx-episodes">
            {results.map(r => <EpisodeCard key={r.id} episode={toEpisode(r)} onOpen={setPlayer} />)}
          </div>
          {cursor && (sort === 'newest' || sort === 'oldest') && (
            <div style={{ padding: '16px var(--flx-gutter)' }}>
              <button className="flx-btn" disabled={loading} onClick={() => void run(true, cursor)}>
                {loading ? 'Loading…' : 'Load more'}
              </button>
            </div>
          )}
        </section>
      )}

      {hasCriteria && results.length === 0 && !loading && (
        <p className="flx-empty">No episodes match that. Try another search.</p>
      )}
      </>)}

      {player && <MomentPlayer messageId={player} onClose={() => setPlayer(null)} />}
    </div>
  );
}
