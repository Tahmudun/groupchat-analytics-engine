import { keyartFor } from '@/lib/flix/keyart';
import { frameStyle } from '@/lib/flix/frame';
import { sameArt, type ArtSpec, type ShowArt } from '@/lib/flix/art';

/** THE show-art renderer — the admin crop previews and the site (poster
 *  cards, billboard, show-page heroes) all render art through this one
 *  component + artframe.css, so admin previews are pixel-what production
 *  ships. Cover fills the box (crop via the spec's frame: object-position +
 *  uniform scale — never a stretch); contain shows the whole image, centered
 *  over a blurred cover copy so the box has no empty bars; no image renders
 *  the deterministic keyart gradient. Mount inside a positioned box. */
export function ArtworkFrame({ art, seed, preset, className, eager }: {
  art: ArtSpec;
  seed: string;               // keyart seed when there's no image
  preset?: string | null;     // admin-chosen keyart preset override
  className?: string;         // af-desktop / af-mobile for hero breakpoints
  eager?: boolean;            // above-the-fold heroes skip lazy loading
}) {
  const cls = className ? `af ${className}` : 'af';
  if (!art.url) {
    return <div className={cls} style={{ background: keyartFor(seed, preset).css }} />;
  }
  const loading = eager ? undefined : ('lazy' as const);
  if (art.fit === 'contain') {
    return (
      <div className={cls}>
        <img className="af-back" src={art.url} alt="" aria-hidden loading={loading} />
        <img className="af-fore" src={art.url} alt="" loading={loading} />
      </div>
    );
  }
  return (
    <div className={cls}>
      <img className="af-cover" src={art.url} alt="" loading={loading} style={frameStyle(art.frame)} />
    </div>
  );
}

/** The hero pair: desktop art ≥700px, mobile art below (artframe.css swaps
 *  them). When both targets resolve to the same render only one element is
 *  emitted — inline data URIs are big, never duplicate them in the HTML. */
export function HeroArt({ art, seed, preset }: {
  art: ShowArt; seed: string; preset?: string | null;
}) {
  if (sameArt(art.heroDesktop, art.heroMobile)) {
    return <ArtworkFrame art={art.heroDesktop} seed={seed} preset={preset} eager />;
  }
  return (
    <>
      <ArtworkFrame art={art.heroDesktop} seed={seed} preset={preset} className="af-desktop" eager />
      <ArtworkFrame art={art.heroMobile} seed={seed} preset={preset} className="af-mobile" eager />
    </>
  );
}
