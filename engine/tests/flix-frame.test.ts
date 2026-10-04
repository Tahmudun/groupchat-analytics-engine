import { describe, expect, it } from 'vitest';
import {
  DEFAULT_FRAME, clampFrame, coverGeometry, dragFrame, frameStyle,
  setZoomCentered, sourceCropWidth,
} from '../lib/flix/frame';

describe('clampFrame', () => {
  it('passes sane values through', () => {
    expect(clampFrame({ x: 30, y: 70, zoom: 1.5 })).toEqual({ x: 30, y: 70, zoom: 1.5 });
  });
  it('clamps focus to 0–100 and zoom to 1–3', () => {
    expect(clampFrame({ x: -10, y: 140, zoom: 9 })).toEqual({ x: 0, y: 100, zoom: 3 });
    expect(clampFrame({ x: 50, y: 50, zoom: 0.2 })).toEqual({ x: 50, y: 50, zoom: 1 });
  });
  it('replaces non-finite values with the default', () => {
    expect(clampFrame({ x: NaN, y: Infinity, zoom: NaN })).toEqual(DEFAULT_FRAME);
  });
});

describe('frameStyle', () => {
  it('returns no style for the default frame (or missing frame)', () => {
    expect(frameStyle(null)).toEqual({});
    expect(frameStyle(undefined)).toEqual({});
    expect(frameStyle(DEFAULT_FRAME)).toEqual({});
  });
  it('sets object-position for a moved focus', () => {
    const s = frameStyle({ x: 20, y: 80, zoom: 1 });
    expect(s.objectPosition).toBe('20% 80%');
    expect(s.transform).toBeUndefined();
  });
  it('adds a scale anchored at the focus when zoomed', () => {
    const s = frameStyle({ x: 25, y: 50, zoom: 2 });
    expect(s.transform).toBe('scale(2)');
    expect(s.transformOrigin).toBe('25% 50%');
  });
});

describe('coverGeometry', () => {
  it('computes the cover scale and pannable ranges (portrait image, wide box)', () => {
    // 200×400 image cover-fitting a 100×50 box: width constrains → scale 0.5,
    // no horizontal slack, 150px of vertical slack.
    const g = coverGeometry({ w: 200, h: 400 }, { w: 100, h: 50 }, 1);
    expect(g.scale).toBeCloseTo(0.5);
    expect(g.rangeX).toBeCloseTo(0);
    expect(g.rangeY).toBeCloseTo(150);
  });
  it('zoom multiplies the scale and grows both ranges', () => {
    const g = coverGeometry({ w: 200, h: 400 }, { w: 100, h: 50 }, 2);
    expect(g.scale).toBeCloseTo(1);
    expect(g.rangeX).toBeCloseTo(100);
    expect(g.rangeY).toBeCloseTo(350);
  });
  it('uses the taller axis when the image is wide for the box', () => {
    const g = coverGeometry({ w: 2000, h: 500 }, { w: 240, h: 120 }, 1);
    expect(g.scale).toBeCloseTo(0.24);
    expect(g.rangeX).toBeCloseTo(240);
    expect(g.rangeY).toBeCloseTo(0);
  });
});

describe('dragFrame', () => {
  // 200×100 image in a 100×100 box: cover scale 1 → rendered 200×100,
  // rangeX = 100px, rangeY = 0. Focus x% maps to x px of horizontal offset.
  const img = { w: 200, h: 100 };
  const box = { w: 100, h: 100 };

  it('moves the image exactly 1:1 with the pointer', () => {
    // Dragging the image 10px left reveals the right side: offset grows 10px
    // = 10 focus points of the 100px range.
    const f = dragFrame({ x: 50, y: 50, zoom: 1 }, -10, 0, img, box);
    expect(f.x).toBeCloseTo(60);
    expect(f.y).toBe(50);
  });
  it('dragging right pulls the left side into view', () => {
    const f = dragFrame({ x: 50, y: 50, zoom: 1 }, 25, 0, img, box);
    expect(f.x).toBeCloseTo(25);
  });
  it('ignores drags along an axis with no slack', () => {
    const f = dragFrame({ x: 50, y: 50, zoom: 1 }, 0, 40, img, box);
    expect(f.y).toBe(50);
  });
  it('clamps at the edges', () => {
    const f = dragFrame({ x: 50, y: 50, zoom: 1 }, -900, 0, img, box);
    expect(f.x).toBe(100);
  });
});

describe('setZoomCentered', () => {
  const img = { w: 200, h: 100 };
  const box = { w: 100, h: 100 };

  it('keeps a centered image centered through a zoom', () => {
    const f = setZoomCentered({ x: 50, y: 50, zoom: 1 }, 2, img, box);
    expect(f).toEqual({ x: 50, y: 50, zoom: 2 });
  });
  it('keeps the point under the box center fixed for an off-center frame', () => {
    // x=0 at zoom 1: box center sits at image px 50. At zoom 2 the offset
    // must be 50 rendered px into a 300px range → x ≈ 16.67.
    const f = setZoomCentered({ x: 0, y: 50, zoom: 1 }, 2, img, box);
    expect(f.x).toBeCloseTo(100 / 6, 3);
  });
  it('clamps the frame when zooming out from an edge', () => {
    const f = setZoomCentered({ x: 100, y: 50, zoom: 2 }, 1, img, box);
    expect(f.x).toBe(100);
    expect(f.zoom).toBe(1);
  });
  it('recenters an axis that loses all slack', () => {
    // At zoom 1 this image has no vertical slack — y must settle at 50.
    const f = setZoomCentered({ x: 50, y: 90, zoom: 2 }, 1, img, box);
    expect(f.y).toBe(50);
  });
  it('clamps the requested zoom to [1, MAX_ZOOM]', () => {
    expect(setZoomCentered({ x: 50, y: 50, zoom: 2 }, 99, img, box).zoom).toBe(3);
    expect(setZoomCentered({ x: 50, y: 50, zoom: 2 }, 0.1, img, box).zoom).toBe(1);
  });
});

describe('sourceCropWidth', () => {
  it('returns the full width when a portrait image fills a wide box', () => {
    expect(sourceCropWidth({ w: 540, h: 960 }, { w: 240, h: 120 }, 1)).toBeCloseTo(540);
  });
  it('halves the crop at 2× zoom', () => {
    expect(sourceCropWidth({ w: 540, h: 960 }, { w: 240, h: 120 }, 2)).toBeCloseTo(270);
  });
  it('is capped by the box aspect when the image is very wide', () => {
    // 2000×500 in a 2:1 box: height constrains → crop shows 1000 source px.
    expect(sourceCropWidth({ w: 2000, h: 500 }, { w: 240, h: 120 }, 1)).toBeCloseTo(1000);
  });
  it('is aspect-invariant in the box dimensions', () => {
    const a = sourceCropWidth({ w: 540, h: 960 }, { w: 240, h: 120 }, 1.5);
    const b = sourceCropWidth({ w: 540, h: 960 }, { w: 2, h: 1 }, 1.5);
    expect(a).toBeCloseTo(b);
  });
});
