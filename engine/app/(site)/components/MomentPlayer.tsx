'use client';
import { useEffect, useRef, useState } from 'react';
import { fmtDate, fmtTime } from '@/lib/flix/format';
import { Pfp } from './Avatars';

type Msg = { id: string; sender: string; sentAt: string; content: string; mediaType: string | null; reactionCount: number };
type Ctx = { center: { id: string; sender: string; sentAt: string; content: string; mediaType: string | null }; messages: Msg[] };

/** Full-screen playback view of a message and the ±6h around it. The red bar
 *  is a real scrubber: it tracks the reel's scroll position, and dragging or
 *  clicking it seeks the reel — like a video timeline. */
export function MomentPlayer({ messageId, onClose }: { messageId: string; onClose: () => void }) {
  const [ctx, setCtx] = useState<Ctx | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [currentId, setCurrentId] = useState(messageId);
  const [frac, setFrac] = useState(0);
  const centerRef = useRef<HTMLDivElement>(null);
  const reelRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);

  useEffect(() => {
    let live = true;
    setCtx(null);
    setError(null);
    fetch(`/api/flix/context?id=${encodeURIComponent(currentId)}`)
      .then(r => r.json())
      .then(body => { if (live) { if (body.error) setError(body.error.message); else setCtx(body.data); } })
      .catch(() => live && setError('Could not load this moment.'));
    return () => { live = false; };
  }, [currentId]);

  useEffect(() => {
    if (ctx) centerRef.current?.scrollIntoView({ block: 'center' });
  }, [ctx]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const onReelScroll = () => {
    const reel = reelRef.current;
    if (!reel) return;
    const range = reel.scrollHeight - reel.clientHeight;
    setFrac(range > 0 ? reel.scrollTop / range : 0);
  };

  const seekToClientX = (clientX: number) => {
    const bar = barRef.current;
    const reel = reelRef.current;
    if (!bar || !reel) return;
    const rect = bar.getBoundingClientRect();
    const f = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    reel.scrollTop = f * (reel.scrollHeight - reel.clientHeight);
  };

  const center = ctx?.center;
  const msgs = ctx?.messages ?? [];
  // The reel is time-ordered, so the message under the playhead is well
  // approximated by indexing the list at the scroll fraction.
  const atIdx = msgs.length > 0 ? Math.min(msgs.length - 1, Math.round(frac * (msgs.length - 1))) : 0;

  const nextDay = () => {
    if (!center) return;
    const next = ctx!.messages.find(m => new Date(m.sentAt).getTime() > new Date(center.sentAt).getTime() + 3600_000);
    if (next) setCurrentId(next.id);
  };

  return (
    <div className="flx-player" role="dialog" aria-modal="true">
      <header>
        <button className="flx-btn" onClick={onClose}>‹ Back</button>
        <span className="title">
          {center ? <>{center.sender} · {fmtDate(center.sentAt)}</> : 'Loading…'}
        </span>
        <button className="flx-btn" onClick={nextDay} disabled={!center}>Next episode ›</button>
      </header>

      <div className="reel" ref={reelRef} onScroll={onReelScroll}>
        {error && <p className="flx-empty">{error}</p>}
        {msgs.map(m => {
          const isCenter = m.id === center?.id;
          return (
            <div key={m.id} className={`flx-msg${isCenter ? ' center' : ''}`} ref={isCenter ? centerRef : undefined}>
              <span className="t">{fmtTime(m.sentAt)}</span>
              <span>
                <span className="who"><Pfp name={m.sender} size={18} /> {m.sender}</span>{' '}
                <span className="txt">{m.content || `[${m.mediaType ?? 'no text'}]`}</span>
                {m.reactionCount > 0 && <span className="rx"> ♥ {m.reactionCount}</span>}
              </span>
            </div>
          );
        })}
      </div>

      {center && msgs.length > 0 && (
        <div
          className="flx-scrub"
          onPointerDown={e => {
            draggingRef.current = true;
            e.currentTarget.setPointerCapture(e.pointerId);
            seekToClientX(e.clientX);
          }}
          onPointerMove={e => { if (draggingRef.current) seekToClientX(e.clientX); }}
          onPointerUp={e => {
            draggingRef.current = false;
            e.currentTarget.releasePointerCapture(e.pointerId);
          }}
          onPointerCancel={() => { draggingRef.current = false; }}
        >
          <div className="bar" ref={barRef}>
            <div className="fill" style={{ width: `${frac * 100}%` }} />
            <div className="dot" style={{ left: `${frac * 100}%` }} />
          </div>
          <div className="times">
            <span>{fmtTime(msgs[0]!.sentAt)}</span>
            <span>{fmtTime(msgs[atIdx]!.sentAt)}</span>
            <span>{fmtTime(msgs[msgs.length - 1]!.sentAt)}</span>
          </div>
        </div>
      )}
    </div>
  );
}
