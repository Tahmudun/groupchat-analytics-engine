'use client';
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { ArtworkFrame } from '@/app/components/ArtworkFrame';
import type { FitMode } from '@/lib/flix/art';
import {
  DEFAULT_FRAME, MAX_ZOOM, dragFrame, isDefaultFrame,
  setZoomCentered, sourceCropWidth, type Dims, type Frame,
} from '@/lib/flix/frame';

/** One artwork target as the editor sees it: the resolved image (custom or
 *  fallback), its crop + fit, and the callbacks to change them. The preview
 *  box renders the REAL ArtworkFrame component at the REAL client aspect
 *  ratio (measured from flix.css / the 1440×900 and 390×844 references), so
 *  the admin sees exactly what production ships. */
export type ArtTarget = {
  key: string;
  label: string;
  aspect: Dims;            // real client container ratio
  width: number;           // preview box CSS width
  minW: number;            // recommended source floor (upload validation)
  minH: number;
  url: string | null;      // resolved image for this target (after fallback)
  hasCustom: boolean;      // a target-specific image is uploaded
  fit: FitMode;
  frame: Frame;
  overlay: 'card' | 'billboard';
  seed: string;            // keyart seed when no image anywhere
  preset?: string | null;
  error?: string | null;   // encode failure for this target's upload
  onFrame: (f: Frame) => void;
  onFit: (m: FitMode) => void;
  onFile: (f: File | undefined) => void;
  onClearCustom: () => void;
};

export function FrameEditor({ targets }: { targets: ArtTarget[] }) {
  return (
    <div className="frame-editor">
      <p className="muted" style={{ margin: '0 0 6px', fontSize: '0.75rem' }}>
        How each surface will display — independent crops: drag to move, pinch / scroll / slider to zoom
      </p>
      <div className="row" style={{ gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        {targets.map(t => <TargetCrop key={t.key} t={t} />)}
      </div>
    </div>
  );
}

/** One standalone crop tool: the production ArtworkFrame in a box shaped
 *  like the real client container, with drag/zoom (cover mode), a fit
 *  switch, an optional target-specific image, and resolution warnings. */
function TargetCrop({ t }: { t: ArtTarget }) {
  const boxRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const cover = t.fit === 'cover';

  // The image's natural pixel size drives crop math + resolution warnings.
  const [img, setImg] = useState<Dims | null>(null);
  useEffect(() => {
    setImg(null);
    if (!t.url) return;
    let alive = true;
    const probe = new Image();
    probe.onload = () => { if (alive) setImg({ w: probe.naturalWidth, h: probe.naturalHeight }); };
    probe.src = t.url;
    return () => { alive = false; };
  }, [t.url]);

  const boxDims = (): Dims | null => {
    const r = boxRef.current?.getBoundingClientRect();
    return r ? { w: r.width, h: r.height } : null;
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (!cover) return;
    e.preventDefault();
    boxRef.current?.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const prev = pointers.current.get(e.pointerId);
    if (!prev || !cover) return;
    const box = boxDims();
    if (!box || !img) return;
    const pts = pointers.current;
    if (pts.size === 2) {
      const other = [...pts.entries()].find(([id]) => id !== e.pointerId)?.[1];
      if (!other) return;
      const before = Math.hypot(prev.x - other.x, prev.y - other.y);
      const after = Math.hypot(e.clientX - other.x, e.clientY - other.y);
      if (before > 0) t.onFrame(setZoomCentered(t.frame, t.frame.zoom * (after / before), img, box));
    } else {
      t.onFrame(dragFrame(t.frame, e.clientX - prev.x, e.clientY - prev.y, img, box));
    }
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
  };
  const onPointerUp = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
  };

  // Wheel-to-zoom must preventDefault (or the page scrolls under the cursor),
  // and React's root-attached wheel listener is passive — attach our own.
  const wheelState = useRef({ t, img });
  wheelState.current = { t, img };
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      const { t: tt, img: i } = wheelState.current;
      if (tt.fit !== 'cover' || !i) return;
      e.preventDefault();
      const r = el.getBoundingClientRect();
      tt.onFrame(setZoomCentered(tt.frame, tt.frame.zoom * (e.deltaY < 0 ? 1.06 : 1 / 1.06), i, { w: r.width, h: r.height }));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  const setSliderZoom = (zoom: number) => {
    const box = boxDims();
    if (!img || !box) return;
    t.onFrame(setZoomCentered(t.frame, zoom, img, box));
  };

  // Resolution warnings: hard floor per target (source below the recommended
  // size will not stay sharp — never implied otherwise), plus the zoom-aware
  // softness check for cover crops of an otherwise-OK source.
  const belowFloor = img && (img.w < t.minW || img.h < t.minH);
  const softAtZoom = img && cover && !belowFloor
    && t.minW / sourceCropWidth(img, t.aspect, t.frame.zoom) > 1.5;

  const boxStyle: CSSProperties = {
    width: t.width,
    aspectRatio: `${t.aspect.w} / ${t.aspect.h}`,
    borderRadius: 8,
    overflow: 'hidden',
    position: 'relative',
    background: 'var(--well)',
    cursor: cover && t.url ? 'grab' : 'default',
    touchAction: 'none', // the box owns all gestures (drag + pinch)
    flex: 'none',
  };

  return (
    <div style={{ maxWidth: Math.max(t.width, 170) }}>
      <div ref={boxRef} style={boxStyle}
        onPointerDown={onPointerDown} onPointerMove={onPointerMove}
        onPointerUp={onPointerUp} onPointerCancel={onPointerUp}>
        <ArtworkFrame art={{ url: t.url, frame: t.frame, fit: t.fit }} seed={t.seed} preset={t.preset} />
        <div className={t.overlay === 'card' ? 'af-ov-card' : 'af-ov-billboard'} />
      </div>
      <p className="muted" style={{ margin: '3px 0 0', fontSize: '0.68rem' }}>{t.label}</p>
      <div className="row" style={{ gap: 6, marginTop: 4, alignItems: 'center' }}>
        <select value={t.fit} aria-label={`Fit mode for ${t.label}`}
          onChange={e => t.onFit(e.target.value as FitMode)} style={{ fontSize: '0.72rem' }}>
          <option value="cover">Fill (crops)</option>
          <option value="contain">Whole image</option>
        </select>
        {!isDefaultFrame(t.frame) && (
          <button className="ghost" onClick={() => t.onFrame({ ...DEFAULT_FRAME })}>Reset</button>
        )}
      </div>
      {cover && t.url && (
        <input type="range" min={1} max={MAX_ZOOM} step={0.01} value={t.frame.zoom}
          aria-label={`Zoom ${t.label}`}
          onChange={e => setSliderZoom(Number(e.target.value))}
          style={{ width: '100%', marginTop: 4 }} />
      )}
      <div className="row" style={{ gap: 6, marginTop: 4, alignItems: 'center' }}>
        <button onClick={() => fileRef.current?.click()} style={{ fontSize: '0.72rem' }}>
          {t.hasCustom ? 'Change image' : 'Custom image'}
        </button>
        <input ref={fileRef} type="file" accept="image/*" hidden
          onChange={e => { t.onFile(e.target.files?.[0]); e.target.value = ''; }} />
        {t.hasCustom && (
          <button className="ghost" title={`Remove this target's image (falls back to show art)`}
            onClick={t.onClearCustom}>✕</button>
        )}
      </div>
      {t.error && (
        <p style={{ margin: '3px 0 0', fontSize: '0.68rem', color: '#e87c03' }}>{t.error}</p>
      )}
      {belowFloor && img && (
        <p style={{ margin: '3px 0 0', fontSize: '0.68rem', color: '#e87c03' }}>
          ⚠ {img.w}×{img.h} source — below the recommended {t.minW}×{t.minH}; it will not stay sharp here
        </p>
      )}
      {softAtZoom && img && (
        <p style={{ margin: '3px 0 0', fontSize: '0.68rem', color: '#e87c03' }}>
          ⚠ Will look soft at this zoom
        </p>
      )}
    </div>
  );
}
