import Link from 'next/link';
import { ArtworkFrame } from '@/app/components/ArtworkFrame';
import type { ArtSpec } from '@/lib/flix/art';

const NO_ART: ArtSpec = { url: null, frame: null, fit: 'cover' };

export type PosterCardProps = {
  href: string;
  title: string;
  caption?: string;
  rank?: number;          // 1-based → giant outlined digit (Top 10 row)
  art?: ArtSpec | null;   // resolved card artwork (image + crop + fit)
  preset?: string | null; // keyart preset when there's no image
  seed?: string;          // keyart seed when no image (defaults to title)
};

/** A "show" poster. Uses the resolved card artwork when present, else
 *  deterministic keyart. Pure poster: no text over uploaded art — the name
 *  only renders centered on keyart cards, where it's the sole identifier.
 *  The caption stays in the aria-label. The Top 10 variant hangs a giant
 *  outlined rank digit off the left. */
export function PosterCard({ href, title, caption, rank, art, preset, seed }: PosterCardProps) {
  const hasImage = Boolean(art?.url);
  const card = (
    <Link href={href} prefetch={false} className="flx-card" aria-label={caption ? `${title} — ${caption}` : title}>
      <div className="art"><ArtworkFrame art={art ?? NO_ART} seed={seed ?? title} preset={preset} /></div>
      {!hasImage && <span className="kname flx-display">{title}</span>}
    </Link>
  );

  if (rank == null) return card;
  return (
    <div className="flx-ranked">
      <span className="rank flx-display" aria-hidden>{rank}</span>
      {card}
    </div>
  );
}
