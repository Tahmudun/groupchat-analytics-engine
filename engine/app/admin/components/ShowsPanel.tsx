'use client';
import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { apiJson, type ProfileRow } from '../client';
import { fileToDataUrl } from '../imageEncode';
import { FrameEditor, type ArtTarget } from './FrameEditor';
import { KEYART_PRESETS, keyartFor } from '@/lib/flix/keyart';
import { normalizeFit, type FitMode } from '@/lib/flix/art';
import { mediaUrl } from '@/lib/flix/format';
import { clampFrame, DEFAULT_FRAME, type Frame } from '@/lib/flix/frame';
import { profileSetupParts } from '@/lib/admin/profileLinks';

const PRESET_IDS = Object.keys(KEYART_PRESETS);

// Resize budgets, kept under the server's MAX_INLINE_IMAGE_CHARS caps.
// card/hero are the per-target artwork overrides in the frame editor.
const IMAGE_LIMITS = {
  avatar: { maxDim: 256, maxChars: 380_000 },
  tile: { maxDim: 512, maxChars: 480_000 },
  banner: { maxDim: 1920, maxChars: 1_350_000 },
  card: { maxDim: 1024, maxChars: 680_000 },
  hero: { maxDim: 1920, maxChars: 1_350_000 },
} as const;

export function ShowsPanel({ chat, onError }: { chat: string; onError: (m: string | null) => void }) {
  const [rows, setRows] = useState<ProfileRow[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const [filter, setFilter] = useState('');

  const load = useCallback(async () => {
    try {
      setRows(await apiJson<ProfileRow[]>(`/api/admin/profiles?chat=${encodeURIComponent(chat)}`));
    } catch (err) {
      onError(err instanceof Error ? err.message : String(err));
    }
  }, [chat, onError]);

  useEffect(() => { void load(); }, [load]);

  const shown = rows.filter(r =>
    !filter || r.display_name.toLowerCase().includes(filter.toLowerCase()) || r.username.toLowerCase().includes(filter.toLowerCase()));

  return (
    <section>
      <h2>shows editor</h2>
      <ProfileLinker chat={chat} rows={rows} onSaved={load} onError={onError} />
      <div className="row" style={{ marginBottom: 10 }}>
        <input placeholder="Filter members…" value={filter} onChange={e => setFilter(e.target.value)} style={{ flex: 1 }} />
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr><th>show</th><th>episodes</th><th>flags</th></tr>
          </thead>
          <tbody>
            {shown.slice(0, 60).map(r => (
              <ShowRow key={`${r.username}:${r.profile_source_username ?? 'own'}`} row={r} chat={chat}
                isOpen={open === r.username}
                onToggle={() => setOpen(open === r.username ? null : r.username)}
                onSaved={() => { void load(); }}
                sourceDisplayName={rows.find(source => source.username === r.profile_source_username)?.display_name ?? r.profile_source_username}
                onError={onError} />
            ))}
          </tbody>
        </table>
      </div>
      {shown.length > 60 && <p className="muted">Showing 60 of {shown.length}. Filter to narrow.</p>}
    </section>
  );
}

function ProfileLinker({ chat, rows, onSaved, onError }: {
  chat: string;
  rows: ProfileRow[];
  onSaved: () => Promise<void>;
  onError: (m: string | null) => void;
}) {
  const [sourceQuery, setSourceQuery] = useState('');
  const [targetQuery, setTargetQuery] = useState('');
  const [source, setSource] = useState<string | null>(null);
  const [targets, setTargets] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const matches = (query: string, candidates: ProfileRow[]) => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return candidates.filter(row =>
      row.username.toLowerCase().includes(q) || row.display_name.toLowerCase().includes(q)).slice(0, 8);
  };
  const sourceCandidates = rows.filter(row => !row.profile_source_username && profileSetupParts(row).length > 0);
  const sourceMatches = matches(sourceQuery, sourceCandidates);
  const targetMatches = matches(targetQuery, rows.filter(row => row.username !== source && !targets.includes(row.username)));
  const sourceRow = rows.find(row => row.username === source) ?? null;
  const parts = sourceRow ? profileSetupParts(sourceRow) : [];

  const link = async () => {
    if (!sourceRow || targets.length === 0) return;
    const targetNames = targets.map(username => rows.find(row => row.username === username)?.display_name ?? username);
    if (!confirm(
      `Use "${sourceRow.display_name}"'s show setup for ${targetNames.length} alt(s)?\n\n` +
      `${targetNames.join(', ')}\n\nThis shares profile art and copy only. Messages, scores, Recaps, pinning, and visibility are untouched.`,
    )) return;
    setSaving(true);
    try {
      await apiJson('/api/admin/profiles', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ chat, source_username: source, target_usernames: targets }),
      });
      setTargets([]);
      setTargetQuery('');
      onError(null);
      await onSaved();
    } catch (err) {
      onError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="banner" style={{ marginBottom: 14 }}>
      <b>share a show setup with alts</b>
      <p className="muted" style={{ margin: '4px 0 10px' }}>
        Linked alts use one source show&rsquo;s art, pfp, tile, framing, tagline, and description without duplicating image storage.
        Their messages and analytics remain separate.
      </p>
      <div className="row" style={{ alignItems: 'flex-start' }}>
        <div style={{ flex: 1, minWidth: 220 }}>
          <input value={sourceQuery} placeholder="Find the configured source show…"
            onChange={event => setSourceQuery(event.target.value)} style={{ width: '100%' }} />
          {sourceMatches.length > 0 && (
            <ul className="merge-matches">
              {sourceMatches.map(row => (
                <li key={row.username}><button onClick={() => { setSource(row.username); setSourceQuery(''); setTargets(current => current.filter(target => target !== row.username)); }}>
                  use {row.display_name} <span className="muted">{profileSetupParts(row).join(' · ')}</span>
                </button></li>
              ))}
            </ul>
          )}
        </div>
        <div style={{ flex: 1, minWidth: 220 }}>
          <input value={targetQuery} placeholder="Find an alt to receive it…" disabled={!source}
            onChange={event => setTargetQuery(event.target.value)} style={{ width: '100%' }} />
          {targetMatches.length > 0 && (
            <ul className="merge-matches">
              {targetMatches.map(row => (
                <li key={row.username}><button onClick={() => { setTargets(current => [...current, row.username]); setTargetQuery(''); }}>
                  + {row.display_name}
                  {row.profile_source_username && <span className="muted"> (currently linked)</span>}
                </button></li>
              ))}
            </ul>
          )}
        </div>
      </div>
      {sourceRow && (
        <div className="merge-selection" style={{ marginTop: 10 }}>
          <p style={{ margin: 0 }}><b>source:</b> {sourceRow.display_name} <span className="muted">— {parts.join(', ')}</span></p>
          {targets.length > 0 && (
            <ul>
              {targets.map(username => (
                <li key={username}>
                  <span>{rows.find(row => row.username === username)?.display_name ?? username}</span>
                  <button className="x" onClick={() => setTargets(current => current.filter(target => target !== username))}>×</button>
                </li>
              ))}
            </ul>
          )}
          <div className="row">
            <button className="primary" disabled={targets.length === 0 || saving} onClick={() => void link()}>
              {saving ? 'Linking…' : `Share setup with ${targets.length || 0} alt${targets.length === 1 ? '' : 's'}`}
            </button>
            <button onClick={() => { setSource(null); setTargets([]); setSourceQuery(''); setTargetQuery(''); }}>clear</button>
          </div>
        </div>
      )}
    </div>
  );
}

function ShowRow({ row, chat, isOpen, onToggle, onSaved, sourceDisplayName, onError }: {
  row: ProfileRow; chat: string; isOpen: boolean;
  onToggle: () => void; onSaved: () => void; sourceDisplayName: string | null;
  onError: (m: string | null) => void;
}) {
  const [tagline, setTagline] = useState(row.tagline ?? '');
  const [description, setDescription] = useState(row.description ?? '');
  const [preset, setPreset] = useState(row.banner_preset ?? '');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(row.avatar_url);
  const [tileUrl, setTileUrl] = useState<string | null>(row.tile_url);
  const [bannerUrl, setBannerUrl] = useState<string | null>(row.banner_url);
  // Crops: card = poster_* columns, desktop hero = banner_* columns (legacy
  // names), mobile hero = hero_mobile_* (migration 110).
  const [cardFrame, setCardFrame] = useState<Frame>(clampFrame({
    x: row.poster_focus_x ?? DEFAULT_FRAME.x,
    y: row.poster_focus_y ?? DEFAULT_FRAME.y,
    zoom: row.poster_zoom ?? DEFAULT_FRAME.zoom,
  }));
  const [heroDesktopFrame, setHeroDesktopFrame] = useState<Frame>(clampFrame({
    x: row.banner_focus_x ?? DEFAULT_FRAME.x,
    y: row.banner_focus_y ?? DEFAULT_FRAME.y,
    zoom: row.banner_zoom ?? DEFAULT_FRAME.zoom,
  }));
  const [heroMobileFrame, setHeroMobileFrame] = useState<Frame>(clampFrame({
    x: row.hero_mobile_focus_x ?? DEFAULT_FRAME.x,
    y: row.hero_mobile_focus_y ?? DEFAULT_FRAME.y,
    zoom: row.hero_mobile_zoom ?? DEFAULT_FRAME.zoom,
  }));
  // Per-target image overrides + fit modes (banner_url is the fallback image).
  const [cardUrl, setCardUrl] = useState<string | null>(row.card_url);
  const [heroDesktopUrl, setHeroDesktopUrl] = useState<string | null>(row.hero_desktop_url);
  const [heroMobileUrl, setHeroMobileUrl] = useState<string | null>(row.hero_mobile_url);
  const [cardFit, setCardFit] = useState<FitMode>(normalizeFit(row.card_fit));
  const [heroDesktopFit, setHeroDesktopFit] = useState<FitMode>(normalizeFit(row.hero_desktop_fit));
  const [heroMobileFit, setHeroMobileFit] = useState<FitMode>(normalizeFit(row.hero_mobile_fit));
  const [pinned, setPinned] = useState(Boolean(row.pinned));
  const [hidden, setHidden] = useState(Boolean(row.hidden));
  const [saving, setSaving] = useState(false);
  // Encode failures render AT the slot — the page-top error banner is out of
  // view from here, which made a failed upload look like nothing happened.
  const [slotErr, setSlotErr] = useState<Record<string, string | null>>({});

  const upload = async (kind: keyof typeof IMAGE_LIMITS, file: File | undefined, set: (p: string | null) => void, errKey?: string) => {
    if (!file) return;
    const key = errKey ?? kind;
    try {
      const { maxDim, maxChars } = IMAGE_LIMITS[kind];
      set(await fileToDataUrl(file, maxDim, maxChars));
      setSlotErr(s => ({ ...s, [key]: null }));
    } catch (err) {
      setSlotErr(s => ({ ...s, [key]: err instanceof Error ? err.message : String(err) }));
    }
  };

  // Replacing the shared show art re-baselines the crops of every target
  // still using it as a fallback; targets with their own image keep theirs.
  const resetFallbackFrames = () => {
    if (!cardUrl) setCardFrame({ ...DEFAULT_FRAME });
    if (!heroDesktopUrl) setHeroDesktopFrame({ ...DEFAULT_FRAME });
    if (!heroMobileUrl && !heroDesktopUrl) setHeroMobileFrame({ ...DEFAULT_FRAME });
  };

  // The three real surfaces, each an independent crop of its resolved image.
  // Aspect ratios are the client's actual containers: the 2:3 poster card,
  // and the hero (100vw × min(78vh, 620px)) measured at the 1440×900 and
  // 390×844 reference viewports.
  const targets: ArtTarget[] = [
    {
      key: 'card', label: 'Card (home rows)', aspect: { w: 2, h: 3 }, width: 150,
      minW: 1000, minH: 1500,
      url: mediaUrl(cardUrl ?? bannerUrl), hasCustom: !!cardUrl,
      fit: cardFit, frame: cardFrame, overlay: 'card',
      seed: row.username, preset: preset || null, error: slotErr.card,
      onFrame: setCardFrame, onFit: setCardFit,
      onFile: f => void upload('card', f, u => { setCardUrl(u); setCardFrame({ ...DEFAULT_FRAME }); }),
      onClearCustom: () => { setCardUrl(null); setCardFrame({ ...DEFAULT_FRAME }); },
    },
    {
      key: 'heroDesktop', label: 'Desktop hero (show page ≥700px)', aspect: { w: 1440, h: 620 }, width: 300,
      minW: 1920, minH: 1080,
      url: mediaUrl(heroDesktopUrl ?? bannerUrl), hasCustom: !!heroDesktopUrl,
      fit: heroDesktopFit, frame: heroDesktopFrame, overlay: 'billboard',
      seed: row.username, preset: preset || null, error: slotErr.heroDesktop,
      onFrame: setHeroDesktopFrame, onFit: setHeroDesktopFit,
      onFile: f => void upload('hero', f, u => {
        setHeroDesktopUrl(u); setHeroDesktopFrame({ ...DEFAULT_FRAME });
        if (!heroMobileUrl) setHeroMobileFrame({ ...DEFAULT_FRAME }); // mobile falls back to this image
      }, 'heroDesktop'),
      onClearCustom: () => {
        setHeroDesktopUrl(null); setHeroDesktopFrame({ ...DEFAULT_FRAME });
        if (!heroMobileUrl) setHeroMobileFrame({ ...DEFAULT_FRAME });
      },
    },
    {
      key: 'heroMobile', label: 'Phone hero (show page <700px)', aspect: { w: 390, h: 620 }, width: 122,
      minW: 1080, minH: 1350,
      url: mediaUrl(heroMobileUrl ?? heroDesktopUrl ?? bannerUrl), hasCustom: !!heroMobileUrl,
      fit: heroMobileFit, frame: heroMobileFrame, overlay: 'billboard',
      seed: row.username, preset: preset || null, error: slotErr.heroMobile,
      onFrame: setHeroMobileFrame, onFit: setHeroMobileFit,
      onFile: f => void upload('hero', f, u => { setHeroMobileUrl(u); setHeroMobileFrame({ ...DEFAULT_FRAME }); }, 'heroMobile'),
      onClearCustom: () => { setHeroMobileUrl(null); setHeroMobileFrame({ ...DEFAULT_FRAME }); },
    },
  ];

  const save = async () => {
    setSaving(true);
    try {
      await apiJson('/api/admin/profiles', {
        method: 'PUT', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          chat, member_username: row.username,
          avatar_url: avatarUrl || null, tile_url: tileUrl || null,
          banner_url: bannerUrl || null, banner_preset: preset || null,
          banner_focus_x: heroDesktopFrame.x, banner_focus_y: heroDesktopFrame.y, banner_zoom: heroDesktopFrame.zoom,
          poster_focus_x: cardFrame.x, poster_focus_y: cardFrame.y, poster_zoom: cardFrame.zoom,
          card_url: cardUrl || null, hero_desktop_url: heroDesktopUrl || null, hero_mobile_url: heroMobileUrl || null,
          card_fit: cardFit, hero_desktop_fit: heroDesktopFit, hero_mobile_fit: heroMobileFit,
          hero_mobile_focus_x: heroMobileFrame.x, hero_mobile_focus_y: heroMobileFrame.y, hero_mobile_zoom: heroMobileFrame.zoom,
          tagline: tagline || null, description: description || null, pinned, hidden,
        }),
      });
      onError(null);
      onSaved();
    } catch (err) {
      onError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  const unlink = async () => {
    if (!confirm(`Stop sharing "${sourceDisplayName ?? row.profile_source_username}"'s show setup with "${row.display_name}"?\n\nThe alt's previous saved setup (if any) will return.`)) return;
    setSaving(true);
    try {
      await apiJson('/api/admin/profiles', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ chat, source_username: null, target_usernames: [row.username] }),
      });
      onError(null);
      onSaved();
    } catch (err) {
      onError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <tr className={isOpen ? 'open' : ''} onClick={onToggle}>
        <td><span className="who">
          {row.avatar_url
            ? <img className="avatar" src={mediaUrl(row.avatar_url) ?? ''} alt="" style={{ objectFit: 'cover' }} />
            : <span className="avatar">{row.display_name.slice(0, 1).toUpperCase()}</span>}
          {row.display_name}
        </span></td>
        <td>{row.message_count.toLocaleString()}</td>
        <td>{[pinned && '📌 pinned', hidden && '🚫 hidden', row.profile_source_username && '↗ shared setup'].filter(Boolean).join(' ') || '—'}</td>
      </tr>
      {isOpen && (
        <tr className="detail"><td colSpan={3}>
          {row.profile_source_username ? (
            <div className="banner">
              <b>Using {sourceDisplayName ?? row.profile_source_username}&rsquo;s show setup</b>
              <p className="muted">
                Art, pfp, tile, framing, tagline, and description stay synced to the source. This show keeps its own activity, scores, Recap, pin, and visibility.
              </p>
              <button disabled={saving} onClick={() => void unlink()}>{saving ? 'Unlinking…' : 'Stop sharing setup'}</button>
            </div>
          ) : (
          <>
          <div className="row" style={{ gap: 16, alignItems: 'flex-start' }}>
            <div style={{ display: 'grid', gap: 8, flex: 1, minWidth: 220 }}>
              <label className="muted">Tagline
                <input value={tagline} onChange={e => setTagline(e.target.value)} placeholder="One line under their name" style={{ width: '100%' }} />
              </label>
              <label className="muted">Description
                <textarea value={description} onChange={e => setDescription(e.target.value)} rows={3}
                  placeholder="2–3 sentences of show synopsis"
                  style={{ width: '100%', background: 'var(--well)', color: 'var(--text)', border: 0, borderRadius: 10, padding: 8, font: 'inherit', resize: 'vertical' }} />
              </label>
              <div className="row">
                <label className="row" style={{ gap: 6 }}><input type="checkbox" checked={pinned} onChange={e => setPinned(e.target.checked)} /> Pin to billboard</label>
                <label className="row" style={{ gap: 6 }}><input type="checkbox" checked={hidden} onChange={e => setHidden(e.target.checked)} /> Hide from rows</label>
              </div>
            </div>
            <div style={{ display: 'grid', gap: 12, minWidth: 240 }}>
              <ImageSlot
                label="Pfp" value={avatarUrl} shape="circle" error={slotErr.avatar}
                hint="Small circle next to their name — episodes, search, player, rewind, watchlist"
                onFile={f => void upload('avatar', f, setAvatarUrl)}
                onClear={() => setAvatarUrl(null)} />
              <ImageSlot
                label="Profile tile" value={tileUrl} shape="square" error={slotErr.tile}
                hint="Their square on the login “Who's watching?” screen (top 8 this week)"
                onFile={f => void upload('tile', f, setTileUrl)}
                onClear={() => setTileUrl(null)} />
              <ImageSlot
                label="Show art" value={bannerUrl} shape="wide" error={slotErr.banner}
                hint="Shared image for all three surfaces below (each can also get its own)"
                onFile={f => void upload('banner', f, u => { setBannerUrl(u); resetFallbackFrames(); })}
                onClear={() => { setBannerUrl(null); resetFallbackFrames(); }} />
              <FrameEditor targets={targets} />
              <label className="muted">Fallback gradient — used wherever no image is set
                <select value={preset} onChange={e => setPreset(e.target.value)} style={{ width: '100%' }}>
                  <option value="">Auto (picked from their name)</option>
                  {PRESET_IDS.map(id => <option key={id} value={id}>{id}</option>)}
                </select>
              </label>
              <div style={{ height: 46, borderRadius: 8, background: keyartFor(row.username, preset || null).css }} />
            </div>
          </div>
          <div className="row" style={{ marginTop: 10 }}>
            <button className="primary" disabled={saving} onClick={() => void save()}>{saving ? 'Saving…' : 'Save show'}</button>
          </div>
          </>
          )}
        </td></tr>
      )}
    </>
  );
}

/** One labeled image upload: what it is, where it shows, a preview in the
 *  shape the site will actually render (circle pfp / square tile / wide art). */
function ImageSlot({ label, hint, value, shape, error, onFile, onClear }: {
  label: string; hint: string; value: string | null;
  shape: 'circle' | 'square' | 'wide';
  error?: string | null;
  onFile: (f: File | undefined) => void; onClear: () => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const src = value ? mediaUrl(value) ?? '' : null;
  const box: CSSProperties = {
    width: shape === 'wide' ? 72 : 40,
    height: 40,
    borderRadius: shape === 'circle' ? '50%' : 8,
    objectFit: 'cover',
    background: 'var(--well)',
    flex: 'none',
  };
  return (
    <div>
      <div className="row" style={{ gap: 8, alignItems: 'center' }}>
        {src
          ? <img src={src} alt="" style={box} />
          : <span style={{ ...box, display: 'inline-block' }} />}
        <button onClick={() => input.current?.click()}>{value ? `Change ${label.toLowerCase()}` : `Upload ${label.toLowerCase()}`}</button>
        <input ref={input} type="file" accept="image/*" hidden
          onChange={e => { onFile(e.target.files?.[0]); e.target.value = ''; }} />
        {value && <button className="ghost" title={`Remove ${label.toLowerCase()}`} onClick={onClear}>✕</button>}
      </div>
      <p className="muted" style={{ margin: '4px 0 0', fontSize: '0.75rem' }}>{hint}</p>
      {error && <p style={{ margin: '4px 0 0', fontSize: '0.75rem', color: '#e87c03' }}>{error}</p>}
    </div>
  );
}
