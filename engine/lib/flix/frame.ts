import type { CSSProperties } from 'react';

/** How a member's show art sits inside its cover boxes (billboard + poster
 *  card): a focal point in percent and a zoom factor. Stored per member
 *  (member_profiles.banner_focus_x/y + banner_zoom, migration 108), edited in
 *  the admin Shows editor frame tool, applied identically on the site and in
 *  the admin preview so what you frame is what renders. */
export type Frame = { x: number; y: number; zoom: number };

export const DEFAULT_FRAME: Frame = { x: 50, y: 50, zoom: 1 };
export const MAX_ZOOM = 3;

const num = (v: number, fallback: number) => (Number.isFinite(v) ? v : fallback);
const bound = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export function clampFrame(f: Frame): Frame {
  return {
    x: bound(num(f.x, DEFAULT_FRAME.x), 0, 100),
    y: bound(num(f.y, DEFAULT_FRAME.y), 0, 100),
    zoom: bound(num(f.zoom, DEFAULT_FRAME.zoom), 1, MAX_ZOOM),
  };
}

export function isDefaultFrame(f: Frame): boolean {
  return f.x === DEFAULT_FRAME.x && f.y === DEFAULT_FRAME.y && f.zoom === DEFAULT_FRAME.zoom;
}

/** Style for an `object-fit: cover` img. Empty for the default frame so
 *  untouched art keeps rendering exactly as before. */
export function frameStyle(f: Frame | null | undefined): CSSProperties {
  if (!f) return {};
  const frame = clampFrame(f);
  if (isDefaultFrame(frame)) return {};
  const style: CSSProperties = { objectPosition: `${frame.x}% ${frame.y}%` };
  if (frame.zoom !== 1) {
    style.transform = `scale(${frame.zoom})`;
    style.transformOrigin = `${frame.x}% ${frame.y}%`;
  }
  return style;
}

export type Dims = { w: number; h: number };

/** Geometry of a cover-fit image inside a box at a zoom: `scale` maps image
 *  px → box px, and `rangeX/rangeY` are the pannable slack in box px (how far
 *  the rendered image overhangs the box on each axis). The focus percent maps
 *  linearly onto that range — x% focus offsets the image by x% of rangeX —
 *  which is exactly what frameStyle's object-position + focus-anchored scale
 *  renders, so editor math built on this geometry stays WYSIWYG. */
export function coverGeometry(img: Dims, box: Dims, zoom: number): {
  scale: number; rangeX: number; rangeY: number;
} {
  const scale = Math.max(box.w / img.w, box.h / img.h) * zoom;
  return { scale, rangeX: img.w * scale - box.w, rangeY: img.h * scale - box.h };
}

/** Move the image exactly with the pointer: a dx px drag shifts the rendered
 *  image dx px, clamped so the box stays covered. Axes with no slack ignore
 *  the drag. */
export function dragFrame(f: Frame, dxPx: number, dyPx: number, img: Dims, box: Dims): Frame {
  const frame = clampFrame(f);
  const { rangeX, rangeY } = coverGeometry(img, box, frame.zoom);
  return clampFrame({
    x: rangeX > 0 ? frame.x - (dxPx / rangeX) * 100 : frame.x,
    y: rangeY > 0 ? frame.y - (dyPx / rangeY) * 100 : frame.y,
    zoom: frame.zoom,
  });
}

/** Set the zoom while keeping the image point under the box center fixed
 *  (standard crop-tool zoom). Axes that lose all slack settle back to 50. */
export function setZoomCentered(f: Frame, zoom: number, img: Dims, box: Dims): Frame {
  const frame = clampFrame(f);
  const next = bound(num(zoom, frame.zoom), 1, MAX_ZOOM);
  const g0 = coverGeometry(img, box, frame.zoom);
  const g1 = coverGeometry(img, box, next);
  // Image-space point currently under the box center, re-solved at the new
  // zoom so it stays put: offset' = center·scale' − box/2.
  const centerX = (frame.x / 100 * g0.rangeX + box.w / 2) / g0.scale;
  const centerY = (frame.y / 100 * g0.rangeY + box.h / 2) / g0.scale;
  return clampFrame({
    x: g1.rangeX > 0 ? ((centerX * g1.scale - box.w / 2) / g1.rangeX) * 100 : 50,
    y: g1.rangeY > 0 ? ((centerY * g1.scale - box.h / 2) / g1.rangeY) * 100 : 50,
    zoom: next,
  });
}

/** Width, in source-image pixels, of the crop a box of this aspect shows at
 *  the given zoom. Depends only on the box's aspect ratio, so the admin
 *  preview box answers for the full-size site render — compare against the
 *  site's display width to warn about upscaling. */
export function sourceCropWidth(img: Dims, box: Dims, zoom: number): number {
  const { scale } = coverGeometry(img, box, zoom);
  return box.w / scale;
}
