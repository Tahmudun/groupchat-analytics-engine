'use client';
import { useMemo, useRef, useState } from 'react';
import { keyartFor } from '@/lib/flix/keyart';
import { initials } from '@/lib/flix/format';
import { buildDateAxis, nearestIndex } from '@/lib/flix/chartGeom';
import type { ScoreSeries } from '@/lib/flix/data';

/** Featured market chart: score lines for the top movers over the trailing
 *  window. Identity is carried by the avatar bubble at each line's endpoint
 *  (a direct label), so line COLOR is free to encode polarity — green when the
 *  member ended above where they started, red when below. Never color-alone.
 *  Interactive: hover / touch-drag snaps a crosshair to the nearest day and a
 *  tooltip reads out that day's date + every line's score (arrow keys work
 *  too). All lines share one date axis (union of their dates), so the
 *  crosshair date is true for every line at that x. */
export function MarketChart({
  series,
  displayNames,
  width = 720,
  height = 240,
}: {
  series: ScoreSeries[];
  displayNames: Record<string, string>;
  width?: number;
  height?: number;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  const lines = useMemo(() => series.filter(s => s.points.length >= 2).slice(0, 3), [series]);
  const axis = useMemo(() => buildDateAxis(lines), [lines]);
  const scoreAt = useMemo(
    () => new Map(lines.map(l => [l.username, new Map(l.points.map(p => [p.date, p.score]))])),
    [lines],
  );
  if (lines.length === 0 || axis.length < 2) return null;

  const pad = { top: 16, right: 96, bottom: 22, left: 12 };
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;

  const allScores = lines.flatMap(l => l.points.map(p => p.score));
  const minY = Math.min(...allScores);
  const maxY = Math.max(...allScores);
  const spanY = maxY - minY || 1;

  const idxOf = new Map(axis.map((d, i) => [d, i]));
  const x = (date: string) => pad.left + ((idxOf.get(date) ?? 0) / (axis.length - 1)) * plotW;
  const y = (v: number) => pad.top + plotH - ((v - minY) / spanY) * plotH;

  const gridYs = [0, 0.5, 1].map(f => pad.top + f * plotH);

  // Endpoint labels collide when two lines finish at similar heights. Compute
  // each line's true end, then push labels apart to a min gap while keeping the
  // connector dot on the real point (a leader offset shows the nudge).
  const LABEL_GAP = 24;
  const ends = lines
    .map(line => ({
      line,
      lastX: x(line.points[line.points.length - 1]!.date),
      lastY: y(line.points[line.points.length - 1]!.score),
      up: line.points[line.points.length - 1]!.score >= line.points[0]!.score,
      labelY: 0,
    }))
    .sort((a, b) => a.lastY - b.lastY);
  let prev = -Infinity;
  for (const e of ends) {
    e.labelY = Math.min(Math.max(e.lastY, prev + LABEL_GAP), height - pad.bottom);
    prev = e.labelY;
  }
  const colorOf = new Map(ends.map(e => [e.line.username, e.up ? '#46d369' : '#ff5c5c']));

  /** clientX → nearest axis index, through the svg's viewBox scaling. */
  const indexFromPointer = (clientX: number): number => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return 0;
    const vbX = ((clientX - rect.left) / rect.width) * width;
    return nearestIndex((vbX - pad.left) / plotW, axis.length);
  };

  const hover = hoverIdx === null ? null : {
    date: axis[Math.min(hoverIdx, axis.length - 1)]!,
    x: pad.left + (Math.min(hoverIdx, axis.length - 1) / (axis.length - 1)) * plotW,
  };
  const hoverRows = hover
    ? lines
        .map(l => ({ username: l.username, score: scoreAt.get(l.username)?.get(hover.date) }))
        .filter((r): r is { username: string; score: number } => r.score !== undefined)
        .sort((a, b) => b.score - a.score)
    : [];

  return (
    <div className="flx-chart">
      <svg ref={svgRef} viewBox={`0 0 ${width} ${height}`} role="img" tabIndex={0}
        aria-label={`Score trend for ${lines.map(l => displayNames[l.username] ?? l.username).join(', ')} over the last ${axis.length} days. Use arrow keys to step through days.`}
        onPointerMove={e => setHoverIdx(indexFromPointer(e.clientX))}
        onPointerDown={e => setHoverIdx(indexFromPointer(e.clientX))}
        onPointerLeave={e => { if (e.pointerType === 'mouse') setHoverIdx(null); }}
        onBlur={() => setHoverIdx(null)}
        onKeyDown={e => {
          if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
            e.preventDefault();
            const step = e.key === 'ArrowLeft' ? -1 : 1;
            setHoverIdx(i => nearestIndex(((i ?? axis.length - 1) + step) / (axis.length - 1), axis.length));
          } else if (e.key === 'Escape') {
            setHoverIdx(null);
          }
        }}>
        {gridYs.map((gy, i) => (
          <line key={i} x1={pad.left} x2={width - pad.right} y1={gy} y2={gy}
            stroke="rgba(255,255,255,0.08)" strokeWidth={1} />
        ))}
        {ends.map(({ line, lastX, lastY, labelY }) => {
          const color = colorOf.get(line.username)!;
          const d = line.points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${x(p.date).toFixed(1)} ${y(p.score).toFixed(1)}`).join(' ');
          const name = displayNames[line.username] ?? line.username;
          return (
            <g key={line.username}>
              <path d={d} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
              <circle cx={lastX} cy={lastY} r={4} fill={color} stroke="#0d0d0d" strokeWidth={2} />
              {/* leader from the point to its (possibly nudged) label */}
              <line x1={lastX} y1={lastY} x2={lastX + 8} y2={labelY} stroke={color} strokeWidth={1} opacity={0.5} />
              <g transform={`translate(${lastX + 10}, ${labelY})`}>
                <rect x={0} y={-11} width={22} height={22} rx={4} fill={keyartFor(line.username).css} />
                <text x={11} y={5} textAnchor="middle" fontSize={12} fontWeight={700} fill="#fff"
                  fontFamily="var(--font-display), sans-serif">{initials(name)}</text>
                <text x={28} y={5} fontSize={11} fill="#e5e5e5">{name.length > 8 ? name.slice(0, 8) + '…' : name}</text>
              </g>
            </g>
          );
        })}
        {hover && (
          <g pointerEvents="none">
            <line x1={hover.x} x2={hover.x} y1={pad.top} y2={pad.top + plotH}
              stroke="rgba(255,255,255,0.4)" strokeWidth={1} strokeDasharray="3 3" />
            {hoverRows.map(r => (
              <circle key={r.username} cx={hover.x} cy={y(r.score)} r={3.5}
                fill={colorOf.get(r.username)} stroke="#0d0d0d" strokeWidth={1.5} />
            ))}
          </g>
        )}
      </svg>
      {hover && hoverRows.length > 0 && (
        <div className={`flx-chart-tip${hover.x > width * 0.55 ? ' left' : ''}`}
          style={{ left: `${(hover.x / width) * 100}%` }} aria-hidden="true">
          <div className="when">{fmtAxisDate(hover.date)}</div>
          {hoverRows.map(r => {
            const name = displayNames[r.username] ?? r.username;
            return (
              <div className="row" key={r.username}>
                <span className="chip" style={{ background: keyartFor(r.username).css }}>{initials(name)}</span>
                <span className="name">{name}</span>
                <span className="val">{Math.round(r.score)}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** '2026-06-24' → 'Wed, Jun 24' (UTC-safe: no timezone drift off the date). */
function fmtAxisDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}
