'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { buildCards, type RecapCard } from '@/lib/recap/cards';
import { STATS_VERSION, type RecapStats } from '@/lib/recap/types';
import { MomentPlayer } from '../../components/MomentPlayer';
import { RecapScene } from './RecapScene';

type LoadState = 'loading' | 'ready' | 'missing' | 'error';

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

const finiteNonNegative = (value: unknown) => typeof value === 'number' && Number.isFinite(value) && value >= 0;
const finite = (value: unknown) => typeof value === 'number' && Number.isFinite(value);
const bounded = (value: unknown, max: number) => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= max;
const nameCount = (value: unknown) => value === null || (isObject(value) && typeof value.name === 'string' && finiteNonNegative(value.count));
const datedCount = (value: unknown, field: string) => value === null || (isObject(value) && typeof value[field] === 'string' && finiteNonNegative(value.count));
const sentimentPerson = (value: unknown) => value === null || (isObject(value) && typeof value.name === 'string' && finite(value.score) && finiteNonNegative(value.count));

/** Reject a stale or malformed blob before the renderer reaches into it. The
 * API is DB-backed, but this boundary keeps a partial compute from crashing a
 * member page and logs a real error instead of inventing analytics. */
function isRecapStats(value: unknown): value is RecapStats {
  if (!isObject(value) || value.version !== STATS_VERSION) return false;
  if (!isObject(value.airtime) || !isObject(value.reactions) || !isObject(value.script) || !isObject(value.fame) || !isObject(value.persona)) return false;
  const { airtime, reactions, script, fame, persona } = value;
  const numbers = [airtime.messages, airtime.words, airtime.shareOfChat, airtime.rank, airtime.membersRanked,
    airtime.peakHour, airtime.longestStreakDays, airtime.longestGapDays, reactions.given, reactions.received,
    script.laughs, script.capsShare, script.profanityCount, fame.mentions];
  return typeof value.member === 'string'
    && numbers.every(finiteNonNegative)
    && bounded(airtime.shareOfChat, 1) && bounded(airtime.peakHour, 23) && bounded(script.capsShare, 1)
    && typeof airtime.clockTag === 'string'
    && datedCount(airtime.busiestDay, 'date') && datedCount(airtime.binge, 'hourStart')
    && nameCount(reactions.topGivenEmoji) && nameCount(reactions.topReceivedEmoji)
    && nameCount(reactions.biggestFan) && nameCount(reactions.theyStan)
    && (reactions.oneSided === null || (isObject(reactions.oneSided) && typeof reactions.oneSided.name === 'string' && finiteNonNegative(reactions.oneSided.sent) && finiteNonNegative(reactions.oneSided.got)))
    && Array.isArray(script.catchphrases) && script.catchphrases.every(item => isObject(item) && typeof item.phrase === 'string' && finiteNonNegative(item.count) && finiteNonNegative(item.ratio))
    && (script.profanityRank === null || finiteNonNegative(script.profanityRank))
    && (script.monologue === null || (isObject(script.monologue) && typeof script.monologue.messageId === 'string' && finiteNonNegative(script.monologue.words) && typeof script.monologue.date === 'string' && typeof script.monologue.preview === 'string'))
    && datedCount(fame.mainCharacterDay, 'date')
    && (fame.approval === null || bounded(fame.approval, 100))
    && Array.isArray(fame.approvalTrend) && fame.approvalTrend.every(item => isObject(item) && typeof item.weekStart === 'string' && finiteNonNegative(item.approval))
    && sentimentPerson(fame.supporter) && sentimentPerson(fame.nemesis) && sentimentPerson(fame.theyPraise) && sentimentPerson(fame.theyRoast)
    && typeof persona.label === 'string' && persona.label.trim().length > 0 && typeof persona.blurb === 'string';
}

export function RecapLauncher({ username, displayName }: { username: string; displayName: string }) {
  const [cards, setCards] = useState<RecapCard[] | null>(null);
  const [stats, setStats] = useState<RecapStats | null>(null);
  const [names, setNames] = useState<Record<string, string>>({});
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState(0);
  const [session, setSession] = useState(0);
  const [leaving, setLeaving] = useState<{ card: RecapCard; dir: 'fwd' | 'back' } | null>(null);
  const [playerId, setPlayerId] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const launchRef = useRef<HTMLButtonElement>(null);
  const lastMoveRef = useRef(0);
  const pointerRef = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    setCards(null);
    setStats(null);
    setNames({});
    setLoadState('loading');
    setOpen(false);
    setIndex(0);
    setLeaving(null);
    setPlayerId(null);
    const controller = new AbortController();
    fetch(`/api/flix/recap/${encodeURIComponent(username)}`, { signal: controller.signal })
      .then(async response => {
        if (response.status === 404) { setLoadState('missing'); return; }
        if (!response.ok) throw new Error(`Recap request failed (${response.status})`);
        const json: unknown = await response.json();
        const data = isObject(json) && isObject(json.data) ? json.data : null;
        if (!data || !isRecapStats(data.stats)) throw new Error('Recap API returned an invalid stats blob');
        setStats(data.stats);
        setCards(buildCards(data.stats, displayName));
        setNames(isObject(data.names)
          ? Object.fromEntries(Object.entries(data.names).filter((entry): entry is [string, string] => typeof entry[1] === 'string'))
          : {});
        setLoadState('ready');
      })
      .catch(error => {
        if (controller.signal.aborted) return;
        console.error(error);
        setLoadState('error');
      });
    return () => controller.abort();
  }, [username, displayName, loadAttempt]);

  const close = useCallback(() => {
    setOpen(false);
    setPlayerId(null);
    requestAnimationFrame(() => launchRef.current?.focus());
  }, []);

  const go = useCallback((dir: 'fwd' | 'back') => {
    if (!cards) return;
    const now = performance.now();
    if (now - lastMoveRef.current < 140) return;
    lastMoveRef.current = now;
    if (dir === 'back' && index <= 0) return;
    if (dir === 'fwd' && index >= cards.length - 1) { close(); return; }
    setLeaving({ card: cards[index]!, dir });
    setIndex(current => dir === 'fwd' ? Math.min(cards.length - 1, current + 1) : Math.max(0, current - 1));
  }, [cards, close, index]);

  useEffect(() => {
    if (!leaving) return;
    const timer = window.setTimeout(() => setLeaving(null), 320);
    return () => window.clearTimeout(timer);
  }, [leaving]);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialogRef.current?.focus({ preventScroll: true });
    const onKey = (event: KeyboardEvent) => {
      if (playerId !== null) return;
      if (event.key === 'Escape') { event.preventDefault(); close(); }
      if (event.key === 'ArrowRight' || event.key === ' ') { event.preventDefault(); go('fwd'); }
      if (event.key === 'ArrowLeft') { event.preventDefault(); go('back'); }
      if (event.key === 'Home') { event.preventDefault(); setLeaving(null); setIndex(0); }
      if (event.key === 'End' && cards) { event.preventDefault(); setLeaving(null); setIndex(cards.length - 1); }
      if (event.key === 'Tab' && dialogRef.current) {
        const focusable = [...dialogRef.current.querySelectorAll<HTMLElement>('button:not([disabled]), a[href]')];
        if (focusable.length === 0) return;
        const first = focusable[0]!;
        const last = focusable[focusable.length - 1]!;
        if (event.shiftKey && (document.activeElement === first || document.activeElement === dialogRef.current)) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKey);
    };
  }, [open, cards, playerId, go, close]);

  const start = () => {
    setIndex(0);
    setLeaving(null);
    setSession(value => value + 1);
    setOpen(true);
  };

  if (loadState === 'missing') return null;
  if (loadState === 'loading') return <button className="flx-btn primary" disabled aria-busy="true">Recap loading…</button>;
  if (loadState === 'error') return <button className="flx-btn" onClick={() => setLoadAttempt(value => value + 1)}>Retry Recap</button>;
  if (!cards || !stats || cards.length === 0) return null;
  const card = cards[index]!;

  return (
    <>
      <button ref={launchRef} className="flx-btn primary" onClick={start}>▶ Recap</button>
      {open && (
        <div ref={dialogRef} className="flx-recap" role="dialog" aria-modal="true" aria-label={`${displayName} Recap, scene ${index + 1} of ${cards.length}`} tabIndex={-1}
          onPointerDown={event => { pointerRef.current = { x: event.clientX, y: event.clientY }; }}
          onPointerUp={event => {
            const startPoint = pointerRef.current;
            pointerRef.current = null;
            if (!startPoint || (event.target as HTMLElement).closest('button, a')) return;
            const dx = event.clientX - startPoint.x;
            const dy = event.clientY - startPoint.y;
            if (Math.abs(dx) > 42 && Math.abs(dx) > Math.abs(dy)) go(dx < 0 ? 'fwd' : 'back');
            else if (Math.hypot(dx, dy) < 12) go(event.clientX < window.innerWidth * 0.3 ? 'back' : 'fwd');
          }}>
          <nav className="flx-recap-progress" aria-label="Recap scenes">
            {cards.map((scene, sceneIndex) => (
              <button key={scene.key} className={sceneIndex === index ? 'current' : sceneIndex < index ? 'seen' : ''}
                aria-label={`Go to scene ${sceneIndex + 1}: ${scene.kicker}`} aria-current={sceneIndex === index ? 'step' : undefined}
                tabIndex={sceneIndex === index ? 0 : -1}
                onClick={event => { event.stopPropagation(); setLeaving(null); setIndex(sceneIndex); }}><span /></button>
            ))}
          </nav>
          <button className="flx-recap-close" aria-label="Close recap" onClick={event => { event.stopPropagation(); close(); }}>✕</button>
          <div className="flx-recap-stage" data-dir={leaving?.dir ?? 'fwd'} aria-live="polite" key={session}>
            {leaving && <RecapScene card={leaving.card} stats={stats} names={names} username={username} displayName={displayName} leaving onPlay={() => {}} />}
            <RecapScene key={`${session}-${card.key}`} card={card} stats={stats} names={names} username={username} displayName={displayName} onPlay={setPlayerId}
              actions={card.key === 'finale' ? <div className="flx-recap-final-actions"><button className="flx-btn primary" onClick={event => { event.stopPropagation(); start(); }}>Replay</button><button className="flx-btn" onClick={event => { event.stopPropagation(); close(); }}>Exit recap</button></div> : undefined} />
          </div>
          <nav className="flx-recap-nav" aria-label="Recap navigation">
            <button disabled={index === 0} onClick={event => { event.stopPropagation(); go('back'); }} aria-label="Previous scene">‹</button>
            <span>{index + 1} / {cards.length}</span>
            <button onClick={event => { event.stopPropagation(); go('fwd'); }} aria-label={index === cards.length - 1 ? 'Exit recap' : 'Next scene'}>{index === cards.length - 1 ? 'Done' : '›'}</button>
          </nav>
        </div>
      )}
      {playerId && <MomentPlayer messageId={playerId} onClose={() => setPlayerId(null)} />}
    </>
  );
}
