import { notFound } from 'next/navigation';
import Link from 'next/link';
import {
  getMemberHeader, getMemberScoreSeries, getGreatestHits, getRecentEpisodes, getCostars,
} from '@/lib/flix/data';
import { fmtInt } from '@/lib/flix/format';
import { HeroArt } from '@/app/components/ArtworkFrame';
import { MarketChart } from '../../components/MarketChart';
import { ChartInfo } from '../../components/ChartInfo';
import { PosterRow } from '../../components/PosterRow';
import { PosterCard } from '../../components/PosterCard';
import { EpisodeCard } from '../../components/EpisodeCard';
import { RecapLauncher } from './RecapLauncher';

export const dynamic = 'force-dynamic';

/** Season chips from the member's active years: "S25 S26". */
function seasons(firstIso: string, lastIso: string): string[] {
  const start = new Date(firstIso).getUTCFullYear();
  const end = new Date(lastIso).getUTCFullYear();
  const out: string[] = [];
  for (let y = start; y <= end; y++) out.push(`S${String(y).slice(2)}`);
  return out;
}

/** Keep the solo chart legible: collapse a long series to ~120 weekly means. */
function downsample(points: { date: string; score: number }[], max = 120): { date: string; score: number }[] {
  if (points.length <= max) return points;
  const bucket = Math.ceil(points.length / max);
  const out: { date: string; score: number }[] = [];
  for (let i = 0; i < points.length; i += bucket) {
    const slice = points.slice(i, i + bucket);
    out.push({ date: slice[0]!.date, score: slice.reduce((n, p) => n + p.score, 0) / slice.length });
  }
  return out;
}

export default async function MemberPage({ params }: { params: Promise<{ username: string }> }) {
  const { username } = await params;
  const decoded = decodeURIComponent(username);
  // Each section degrades to empty on a transient failure (e.g. the pooler
  // briefly out of client slots) instead of 500ing the whole page.
  // These reads are independent; start them together so a profile click does
  // not pay the header query's latency before the rest of the page can load.
  const [header, rawSeries, hits, recent, costars] = await Promise.all([
    getMemberHeader(decoded).catch(() => null),
    getMemberScoreSeries(decoded).catch(() => []),
    getGreatestHits(decoded).catch(() => []),
    getRecentEpisodes(decoded).catch(() => []),
    getCostars(decoded).catch(() => []),
  ]);
  if (!header) notFound();

  const match = Math.round(header.scorePercentile * 100);
  const chips = seasons(header.firstMessageAt, header.lastActiveAt);
  const desc = header.description
    ?? `Joined ${chips[0] ?? 'S25'}. ${fmtInt(header.messagesAllTime)} episodes. A Flix original.`;
  const series = downsample(rawSeries);

  return (
    <>
      <section className="flx-billboard">
        <div className="art">
          <HeroArt art={header.art} seed={header.username} preset={header.bannerPreset} />
        </div>
        <div className="shade" />
        <div className="meat">
          <div className="kicker">Flix original</div>
          <h1 className="flx-display">{header.displayName}</h1>
          <div className="sub">
            {match > 0 && <span className="flx-badge-match">{match}% match</span>}
            {chips.map(c => <span key={c} className="flx-chip">{c}</span>)}
          </div>
          {header.aliases.length > 0 && (
            <p className="desc" style={{ marginBottom: 6 }}>
              <span style={{ color: 'var(--flx-muted)' }}>Also known as </span>
              {header.aliases.join(', ')}
            </p>
          )}
          {header.tagline && <p className="desc" style={{ fontStyle: 'italic', margin: '0 0 8px' }}>{header.tagline}</p>}
          <p className="desc">{desc}</p>
          <div className="actions">
            <RecapLauncher username={header.username} displayName={header.displayName} />
          </div>
        </div>
      </section>

      {series.length >= 2 && (
        <section className="flx-market">
          <div className="head"><h2 className="flx-display">Score history</h2><small>All-time index <ChartInfo context="member" /></small></div>
          <MarketChart series={[{ username: header.username, points: series }]} displayNames={{ [header.username]: header.displayName }} />
        </section>
      )}

      {hits.length > 0 && (
        <div id="hits">
          <PosterRow title="Greatest hits" blurb="Most-reacted episodes of all time">
            {hits.map(e => <MemberEpisode key={e.id} episode={e} />)}
          </PosterRow>
        </div>
      )}

      {recent.length > 0 && (
        <section className="flx-section">
          <h2 style={{ padding: '0 var(--flx-gutter)', fontSize: '1.15rem', margin: '0 0 10px' }}>Recent episodes</h2>
          <div className="flx-episodes">
            {recent.map(e => <EpisodeCard key={e.id} episode={e} />)}
          </div>
        </section>
      )}

      {costars.length > 0 && (
        <PosterRow title="Frequent co-stars" blurb="Who they play off most">
          {costars.map(c => (
            <PosterCard
              key={c.username}
              href={`/duos?a=${encodeURIComponent(header.username)}&b=${encodeURIComponent(c.username)}`}
              title={c.displayName}
              caption={`${fmtInt(c.interactions)} scenes`}
              art={c.art}
              seed={c.username}
            />
          ))}
        </PosterRow>
      )}

      <section className="flx-section" style={{ padding: '0 var(--flx-gutter)' }}>
        <Link className="flx-btn" href="/">← Back to Flix</Link>
      </section>
    </>
  );
}

/** Greatest-hits posters are episode cards laid in the scroll strip. */
function MemberEpisode({ episode }: { episode: Parameters<typeof EpisodeCard>[0]['episode'] }) {
  return <div style={{ width: 300, flex: 'none' }}><EpisodeCard episode={episode} /></div>;
}
