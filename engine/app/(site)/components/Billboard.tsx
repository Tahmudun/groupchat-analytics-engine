import Link from 'next/link';
import { fmtInt } from '@/lib/flix/format';
import { HeroArt } from '@/app/components/ArtworkFrame';
import type { Billboard as BillboardData } from '@/lib/flix/data';

/** The featured show at the top of the home page. */
export function Billboard({ pick }: { pick: BillboardData }) {
  const desc = pick.description
    ?? `${fmtInt(pick.messagesAllTime)} episodes and counting. Now streaming on Flix.`;
  const href = `/member/${encodeURIComponent(pick.username)}`;

  return (
    <section className="flx-billboard">
      <div className="art">
        <HeroArt art={pick.art} seed={pick.username} preset={pick.bannerPreset} />
      </div>
      <div className="shade" />
      <div className="meat">
        <div className="kicker">Featured show</div>
        <h1 className="flx-display">{pick.displayName}</h1>
        {pick.tagline && <div className="sub"><span>{pick.tagline}</span></div>}
        <p className="desc">{desc}</p>
        <div className="actions">
          <Link className="flx-btn primary" href={`${href}#hits`}>▶ This week&apos;s moments</Link>
          <Link className="flx-btn" href={href}>＋ Show page</Link>
        </div>
      </div>
    </section>
  );
}
