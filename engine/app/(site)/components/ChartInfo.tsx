'use client';
import { useEffect, useRef, useState } from 'react';

/** ⓘ next to a score chart: explains what the lines are and how the score is
 *  computed. One copy source for both charts so the story never drifts —
 *  weights mirror lib/scoring/formula.ts (bump both together). */
const COMPONENTS: [string, string, string][] = [
  ['30%', 'Activity', 'messages sent that day (photos & clips count extra)'],
  ['25%', 'Reputation', 'how positively others talk about them when mentioned'],
  ['20%', 'Reactions', 'reactions their messages received'],
  ['15%', 'Replies', 'replies their messages pulled'],
  ['10%', 'Longevity', 'how long they’ve been in the chat'],
];

export function ChartInfo({ context }: { context: 'market' | 'member' }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <span className="flx-info" ref={rootRef}>
      <button type="button" aria-expanded={open} aria-label="What is this chart?"
        onClick={() => setOpen(o => !o)}>i</button>
      {open && (
        <div className="pop" role="note">
          <p>
            {context === 'market'
              ? 'Each line is a member’s daily FLIX score — a 0–2000 index of how hard they’re carrying the chat — over the last two weeks.'
              : 'This line is the member’s daily FLIX score — a 0–2000 index of how hard they’re carrying the chat — across their whole run (long histories are averaged into buckets).'}
          </p>
          <p className="lead">Each day&apos;s score blends:</p>
          <ul>
            {COMPONENTS.map(([w, name, what]) => (
              <li key={name}><b>{w}</b> <span className="k">{name}</span> — {what}</li>
            ))}
          </ul>
          <p>
            {context === 'market'
              ? 'Green means they ended the window above where they started; red means below. Hover or drag on the chart to read any day.'
              : 'Green means the run ended above where it started; red means below. Hover or drag on the chart to read any day.'}
          </p>
        </div>
      )}
    </span>
  );
}
