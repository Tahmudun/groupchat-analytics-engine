'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { apiJson, type CustomCategory, type CategoryEntry, type ProfileRow } from '../client';
import { fileToDataUrl } from '../imageEncode';
import { mediaUrl, initials } from '@/lib/flix/format';

// Resize budget for poster art, kept under the server's poster cap.
const POSTER_LIMIT = { maxDim: 512, maxChars: 680_000 };
const SEARCH_DEBOUNCE_MS = 250;

type SearchCard = { username: string; displayName: string; preset: string | null; art: { url: string | null } };

export function CategoriesPanel({ chat, onError }: { chat: string; onError: (m: string | null) => void }) {
  const [cats, setCats] = useState<CustomCategory[]>([]);
  const [newTitle, setNewTitle] = useState('');
  const [thumbs, setThumbs] = useState<Record<string, string | null>>({});

  const load = useCallback(async () => {
    try {
      setCats(await apiJson<CustomCategory[]>(`/api/admin/categories?chat=${encodeURIComponent(chat)}`));
    } catch (err) {
      onError(err instanceof Error ? err.message : String(err));
    }
  }, [chat, onError]);

  useEffect(() => { void load(); }, [load]);

  // Member thumbnails (avatar → card art → banner). The profiles endpoint is
  // slow on the free tier (~11s) — names render immediately, thumbs hydrate.
  useEffect(() => {
    let cancelled = false;
    apiJson<ProfileRow[]>(`/api/admin/profiles?chat=${encodeURIComponent(chat)}`)
      .then(rows => {
        if (cancelled) return;
        setThumbs(Object.fromEntries(rows.map(r => [r.username, r.avatar_url ?? r.card_url ?? r.banner_url])));
      })
      .catch(() => { /* thumbnails are cosmetic — initials cover it */ });
    return () => { cancelled = true; };
  }, [chat]);

  const call = async (method: string, body: unknown) => {
    try {
      await apiJson('/api/admin/categories', { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      onError(null);
      await load();
    } catch (err) {
      onError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <section>
      <h2>home categories</h2>
      <p className="muted" style={{ marginTop: -4, marginBottom: 10 }}>
        Custom poster rows shown under the computed ones on the home page. Add members by
        search — their card uses the live show art from the Shows editor.
      </p>

      <div className="row" style={{ marginBottom: 12 }}>
        <input placeholder="New row title (e.g. Australians)" value={newTitle} onChange={e => setNewTitle(e.target.value)} style={{ flex: 1 }} />
        <button className="primary" disabled={!newTitle.trim()} onClick={() => { void call('POST', { type: 'category', chat, title: newTitle.trim() }); setNewTitle(''); }}>Add row</button>
      </div>

      {cats.length === 0 && <p className="muted">No custom rows yet.</p>}
      {cats.map((cat, ci) => (
        <div key={cat.id} style={{ background: 'var(--well)', borderRadius: 12, padding: 12, marginBottom: 10 }}>
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <strong>{cat.title}</strong>
            <div className="row">
              <button title="Move row up" disabled={ci === 0} onClick={() => void call('PUT', { type: 'category', id: cat.id, move: 'up' })}>↑</button>
              <button title="Move row down" disabled={ci === cats.length - 1} onClick={() => void call('PUT', { type: 'category', id: cat.id, move: 'down' })}>↓</button>
              <label className="row muted" style={{ gap: 6 }}>
                <input type="checkbox" checked={cat.enabled} onChange={e => void call('PUT', { type: 'category', id: cat.id, enabled: e.target.checked })} /> shown
              </label>
              <button onClick={() => void call('DELETE', { type: 'category', id: cat.id })}>Delete row</button>
            </div>
          </div>

          <ul style={{ listStyle: 'none', padding: 0, margin: '10px 0', display: 'flex', flexDirection: 'column', gap: 6 }}>
            {cat.entries.map((e, ei) => (
              <EntryRow
                key={e.id} entry={e} thumb={mediaUrl(e.member_username ? thumbs[e.member_username] ?? null : e.poster_url)}
                canUp={ei > 0} canDown={ei < cat.entries.length - 1} onCall={call}
              />
            ))}
            {cat.entries.length === 0 && <li className="muted">no entries yet</li>}
          </ul>

          <MemberSearch categoryId={cat.id} inRow={new Set(cat.entries.map(e => e.member_username).filter((u): u is string => !!u))} onCall={call} onError={onError} />
          <details style={{ marginTop: 8 }}>
            <summary className="muted" style={{ cursor: 'pointer' }}>+ custom card (made-up show, own poster)</summary>
            <AddFreeform categoryId={cat.id} onAdd={call} onError={onError} />
          </details>
        </div>
      ))}
    </section>
  );
}

function Thumb({ src, name }: { src: string | null; name: string }) {
  if (src) return <img src={src} alt="" style={{ width: 28, height: 40, borderRadius: 4, objectFit: 'cover', flexShrink: 0 }} />;
  return (
    <span aria-hidden style={{ width: 28, height: 40, borderRadius: 4, flexShrink: 0, display: 'grid', placeItems: 'center', background: 'var(--panel, #333)', fontSize: 14 }}>
      {initials(name)}
    </span>
  );
}

function EntryRow({ entry, thumb, canUp, canDown, onCall }: {
  entry: CategoryEntry;
  thumb: string | null;
  canUp: boolean;
  canDown: boolean;
  onCall: (method: string, body: unknown) => Promise<void>;
}) {
  return (
    <li className="row" style={{ gap: 8, alignItems: 'center' }}>
      <Thumb src={thumb} name={entry.title} />
      <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {entry.title}
        {entry.member_username && <span className="muted"> · @{entry.member_username}</span>}
        {entry.subtitle && <span className="muted"> — {entry.subtitle}</span>}
      </span>
      <button title="Move up" disabled={!canUp} onClick={() => void onCall('PUT', { type: 'entry', id: entry.id, move: 'up' })}>↑</button>
      <button title="Move down" disabled={!canDown} onClick={() => void onCall('PUT', { type: 'entry', id: entry.id, move: 'down' })}>↓</button>
      <button title="Remove" onClick={() => void onCall('DELETE', { type: 'entry', id: entry.id })}>×</button>
    </li>
  );
}

function MemberSearch({ categoryId, inRow, onCall, onError }: {
  categoryId: number;
  inRow: Set<string>;
  onCall: (method: string, body: unknown) => Promise<void>;
  onError: (m: string | null) => void;
}) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState<SearchCard[]>([]);

  useEffect(() => {
    if (!q.trim()) { setResults([]); return; }
    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        const cards = await apiJson<SearchCard[]>(`/api/flix/members/search?q=${encodeURIComponent(q.trim())}`);
        if (!cancelled) setResults(cards);
      } catch (err) {
        if (!cancelled) onError(err instanceof Error ? err.message : String(err));
      }
    }, SEARCH_DEBOUNCE_MS);
    return () => { cancelled = true; clearTimeout(t); };
  }, [q, onError]);

  const add = async (m: SearchCard) => {
    await onCall('POST', { type: 'entry', category_id: categoryId, title: m.displayName, member_username: m.username });
    setQ('');
    setResults([]);
  };

  return (
    <div>
      <input placeholder="Add member — search name or alias…" value={q} onChange={e => setQ(e.target.value)} style={{ width: '100%' }} />
      {results.length > 0 && (
        <ul style={{ listStyle: 'none', padding: 6, margin: '6px 0 0', display: 'flex', flexWrap: 'wrap', gap: 6, background: 'var(--panel, #222)', borderRadius: 8 }}>
          {results.map(m => {
            const added = inRow.has(m.username);
            return (
              <li key={m.username}>
                <button className="row" style={{ gap: 6, alignItems: 'center' }} disabled={added} onClick={() => void add(m)}>
                  <Thumb src={m.art.url} name={m.displayName} />
                  <span>{m.displayName}{added ? ' ✓ added' : ''}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function AddFreeform({ categoryId, onAdd, onError }: {
  categoryId: number;
  onAdd: (method: string, body: unknown) => Promise<void>;
  onError: (m: string | null) => void;
}) {
  const [title, setTitle] = useState('');
  const [subtitle, setSubtitle] = useState('');
  const [posterUrl, setPosterUrl] = useState<string | null>(null);
  const [preset, setPreset] = useState('');
  const posterInput = useRef<HTMLInputElement>(null);

  const uploadPoster = async (file: File | undefined) => {
    if (!file) return;
    try { setPosterUrl(await fileToDataUrl(file, POSTER_LIMIT.maxDim, POSTER_LIMIT.maxChars)); onError(null); }
    catch (err) { onError(err instanceof Error ? err.message : String(err)); }
  };

  const add = async () => {
    if (!title.trim()) return;
    await onAdd('POST', {
      type: 'entry', category_id: categoryId, title: title.trim(),
      subtitle: subtitle || null, poster_url: posterUrl, poster_preset: preset || null,
    });
    setTitle(''); setSubtitle(''); setPosterUrl(null); setPreset('');
  };

  return (
    <div className="row" style={{ gap: 6, marginTop: 8 }}>
      <input placeholder="Show name" value={title} onChange={e => setTitle(e.target.value)} style={{ flex: 1, minWidth: 100 }} />
      <input placeholder="Subtitle" value={subtitle} onChange={e => setSubtitle(e.target.value)} style={{ flex: 1, minWidth: 90 }} />
      <button onClick={() => posterInput.current?.click()}>{posterUrl ? '✓ poster' : 'Poster'}</button>
      <input ref={posterInput} type="file" accept="image/*" hidden onChange={e => void uploadPoster(e.target.files?.[0])} />
      <button className="primary" disabled={!title.trim()} onClick={() => void add()}>Add</button>
    </div>
  );
}
