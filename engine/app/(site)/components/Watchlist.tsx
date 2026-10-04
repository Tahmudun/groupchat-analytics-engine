import Link from 'next/link';
import { keyartFor } from '@/lib/flix/keyart';
import { fmtInt, fmtDelta, initials, mediaUrl } from '@/lib/flix/format';
import type { WeeklyStat } from '@/lib/flix/categories';
import type { ScorePoint } from '@/lib/flix/data';

/** Compact 7-day sparkline. Colored by the week-over-week delta (not the
 *  intra-week daily trend) so it always agrees with the Δ badge beside it. */
function Sparkline({ points, up }: { points: ScorePoint[]; up: boolean }) {
  if (points.length < 2) return <span className="spark">—</span>;
  const w = 56, h = 18;
  const scores = points.map(p => p.score);
  const min = Math.min(...scores), max = Math.max(...scores), span = max - min || 1;
  const d = points.map((p, i) =>
    `${i === 0 ? 'M' : 'L'} ${((i / (points.length - 1)) * w).toFixed(1)} ${(h - ((p.score - min) / span) * h).toFixed(1)}`,
  ).join(' ');
  return (
    <svg className="spark" width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden>
      <path d={d} fill="none" stroke={up ? '#46d369' : '#ff5c5c'} strokeWidth={1.5} strokeLinejoin="round" />
    </svg>
  );
}

export function Watchlist({
  rows,
}: {
  rows: Array<{ stat: WeeklyStat; delta: number; spark: ScorePoint[] }>;
}) {
  return (
    <ul className="flx-watchlist">
      {rows.map(({ stat, delta, spark }) => {
        const avatar = mediaUrl(stat.avatar_url);
        return (
          <li key={stat.member_username}>
            <Link href={`/member/${encodeURIComponent(stat.member_username)}`} prefetch={false}>
              <span className="who">
                {avatar
                  ? <img className="flx-avatar" src={avatar} alt="" />
                  : <span className="flx-avatar flx-display" style={{ background: keyartFor(stat.member_username).css }}>{initials(stat.display_name)}</span>}
                <span>{stat.display_name}</span>
              </span>
              <Sparkline points={spark} up={delta >= 0} />
              <span className="score flx-num">{fmtInt(stat.weekly_score)}</span>
              <span className={`delta ${delta >= 0 ? 'flx-up' : 'flx-down'}`}>{fmtDelta(delta)}</span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
