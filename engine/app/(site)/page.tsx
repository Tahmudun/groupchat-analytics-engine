import Link from 'next/link';
import { getWeeklyStats, getBillboardPick, getScoreSeries, getCustomRows, type ScorePoint } from '@/lib/flix/data';
import { buildCategoryRows, customEntryCard } from '@/lib/flix/categories';
import { deltaFraction } from '@/lib/flix/format';
import { Billboard } from './components/Billboard';
import { MarketChart } from './components/MarketChart';
import { ChartInfo } from './components/ChartInfo';
import { Watchlist } from './components/Watchlist';
import { PosterRow } from './components/PosterRow';
import { PosterCard } from './components/PosterCard';

export const dynamic = 'force-dynamic';

const MARKET_WINDOW_DAYS = 14;
const WATCHLIST_SIZE = 8;
const CHART_LINES = 3;

export default async function HomePage() {
  // weekly_stats may not exist yet (first run before the pipeline builds it) —
  // degrade to the "run the pipeline" state instead of crashing.
  const stats = await getWeeklyStats().catch(() => []);
  if (stats.length === 0) {
    return (
      <div className="flx-page-head">
        <h1 className="flx-display">FLIX</h1>
        <p>No episodes yet. Run the pipeline from the admin page to start the season.</p>
      </div>
    );
  }

  const rows = buildCategoryRows(stats);
  const billboard = await getBillboardPick(stats).catch(() => null);
  const displayNames = Object.fromEntries(stats.map(s => [s.member_username, s.display_name]));
  const statsByUsername = new Map(stats.map(s => [s.member_username, s]));

  // Market: the members whose score swung most this week (up or down), active
  // only. Rank by absolute point movement (a real swing), annotate with the
  // bounded symmetric % so a dormant→busy jump doesn't read as a fake million %.
  const movers = stats
    .filter(s => s.messages_7d > 0)
    .map(s => ({ stat: s, d: deltaFraction(s.weekly_score, s.prev_score), swing: Math.abs(s.weekly_score - s.prev_score) }))
    .sort((a, b) => b.swing - a.swing);

  const watch = movers.slice(0, WATCHLIST_SIZE);
  const seriesUsers = watch.map(m => m.stat.member_username);
  const series = seriesUsers.length
    ? await getScoreSeries(seriesUsers, MARKET_WINDOW_DAYS).catch(() => [])
    : [];
  const seriesByUser = new Map(series.map(s => [s.username, s.points]));
  const sparkOf = (u: string): ScorePoint[] => (seriesByUser.get(u) ?? []).slice(-7);

  const chartSeries = movers.slice(0, CHART_LINES)
    .map(m => series.find(s => s.username === m.stat.member_username))
    .filter((s): s is NonNullable<typeof s> => Boolean(s));

  const customRows = await getCustomRows().catch(() => []);

  return (
    <>
      {billboard && <Billboard pick={billboard} />}

      <section className="flx-market">
        <div className="head">
          <h2 className="flx-display">Flix Market</h2>
          <small>Who&apos;s up this week <ChartInfo context="market" /></small>
        </div>
        {chartSeries.length > 0 && <MarketChart series={chartSeries} displayNames={displayNames} />}
        <Watchlist rows={watch.map(m => ({ stat: m.stat, delta: m.d, spark: sparkOf(m.stat.member_username) }))} />
      </section>

      {rows.map(row => (
        <PosterRow key={row.id} title={row.title} blurb={row.blurb}>
          {row.cards.map((c, i) => (
            <PosterCard
              key={c.username}
              href={`/member/${encodeURIComponent(c.username)}`}
              title={c.displayName}
              caption={c.caption}
              rank={row.ranked ? i + 1 : undefined}
              art={c.art}
              preset={c.preset}
              seed={c.username}
            />
          ))}
        </PosterRow>
      ))}

      {customRows.map(row => (
        <PosterRow key={row.id} title={row.title}>
          {row.entries.map(e => {
            const c = customEntryCard(e, statsByUsername);
            return (
              <PosterCard
                key={c.key}
                href={c.href}
                title={c.title}
                caption={c.caption ?? undefined}
                art={c.art}
                preset={c.preset}
                seed={c.seed}
              />
            );
          })}
        </PosterRow>
      ))}

      <section className="flx-section">
        <div className="flx-promos">
          <Link className="flx-promo universe" href="/universe" prefetch={false}>
            <span>NEW EXPERIENCE</span>
            <h3 className="flx-display">Enter the Universe</h3>
            <p>Explore every member, orbit, connection and era in the Netflixia Cinematic Universe.</p>
          </Link>
          <Link className="flx-promo" href="/duos" style={{ background: 'linear-gradient(135deg,#3c096c,#7b2ff7)' }}>
            <h3 className="flx-display">Duos</h3>
            <p>Pick two members and see when they played off each other.</p>
          </Link>
          <Link className="flx-promo" href="/rewind" style={{ background: 'linear-gradient(135deg,#7a0c14,#e50914)' }}>
            <h3 className="flx-display">Rewind</h3>
            <p>Jump to any night and see who was awake.</p>
          </Link>
        </div>
      </section>
    </>
  );
}
