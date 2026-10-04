import { clampFrame, isDefaultFrame, type Frame } from './frame';

/** How one artwork target renders: the resolved image (after fallbacks), its
 *  crop, and whether it fills the box (cover, may crop) or shows the whole
 *  image (contain, blurred cover copy behind). Rendered by ArtworkFrame —
 *  the SAME component in the admin previews and on the site. */
export type FitMode = 'cover' | 'contain';

export type ArtSpec = {
  url: string | null;
  frame: Frame | null;
  fit: FitMode;
};

/** The three places a show's art renders, each with independent image, crop,
 *  and fit (migration 110): the 2:3 poster card, the desktop hero
 *  (billboard/show page ≥700px), and the mobile hero (<700px). */
export type ShowArt = { card: ArtSpec; heroDesktop: ArtSpec; heroMobile: ArtSpec };

/** Raw per-target columns. Only `banner_url` (the original show art) is
 *  required — it's the fallback image, so old records keep working. */
export type ShowArtSource = {
  banner_url: string | null;
  card_url?: string | null;
  hero_desktop_url?: string | null;
  hero_mobile_url?: string | null;
  card_fit?: string | null;
  hero_desktop_fit?: string | null;
  hero_mobile_fit?: string | null;
  card_frame?: Frame | null;
  hero_desktop_frame?: Frame | null;
  hero_mobile_frame?: Frame | null;
};

export function normalizeFit(v: string | null | undefined): FitMode {
  return v === 'contain' ? 'contain' : 'cover';
}

/** Resolve the fallback chain: each target uses its own image when uploaded,
 *  else the shared show art (mobile prefers the desktop hero image first).
 *  Frames and fits are strictly per-target — crops never leak across. */
export function resolveShowArt(s: ShowArtSource): ShowArt {
  const heroDesktopUrl = s.hero_desktop_url ?? s.banner_url ?? null;
  return {
    card: {
      url: s.card_url ?? s.banner_url ?? null,
      frame: s.card_frame ?? null,
      fit: normalizeFit(s.card_fit),
    },
    heroDesktop: {
      url: heroDesktopUrl,
      frame: s.hero_desktop_frame ?? null,
      fit: normalizeFit(s.hero_desktop_fit),
    },
    heroMobile: {
      url: s.hero_mobile_url ?? heroDesktopUrl,
      frame: s.hero_mobile_frame ?? null,
      fit: normalizeFit(s.hero_mobile_fit),
    },
  };
}

const frameKey = (f: Frame | null): string => {
  if (!f) return 'default';
  const c = clampFrame(f);
  return isDefaultFrame(c) ? 'default' : `${c.x}|${c.y}|${c.zoom}`;
};

/** True when two specs produce the identical render — the heroes then share
 *  one element instead of duplicating a ~1MB inline data URI in the HTML. */
export function sameArt(a: ArtSpec, b: ArtSpec): boolean {
  return a.url === b.url && a.fit === b.fit && frameKey(a.frame) === frameKey(b.frame);
}
