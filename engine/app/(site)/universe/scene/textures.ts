// engine/app/(site)/universe/scene/textures.ts
// Procedural sprite textures — generated once, no image assets.
import { CanvasTexture, SRGBColorSpace } from 'three';

function canvasOf(size: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  return [canvas, canvas.getContext('2d')!];
}

function toTexture(canvas: HTMLCanvasElement): CanvasTexture {
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

/** Soft radial glow — the deep-field star sprite. */
export function glowTexture(size = 128): CanvasTexture {
  const [canvas, ctx] = canvasOf(size);
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.18, 'rgba(255,255,255,.85)');
  g.addColorStop(0.42, 'rgba(255,255,255,.28)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return toTexture(canvas);
}

/** Glow plus 4-point diffraction spikes — named worlds. */
export function spikeTexture(size = 192): CanvasTexture {
  const [canvas, ctx] = canvasOf(size);
  const c = size / 2;
  const glow = ctx.createRadialGradient(c, c, 0, c, c, c);
  glow.addColorStop(0, 'rgba(255,255,255,1)');
  glow.addColorStop(0.14, 'rgba(255,255,255,.9)');
  glow.addColorStop(0.36, 'rgba(255,255,255,.22)');
  glow.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, size, size);
  ctx.globalCompositeOperation = 'lighter';
  for (const [w, l] of [[size * 0.016, c * 0.98], [size * 0.05, c * 0.4]] as const) {
    for (const vertical of [false, true]) {
      const grad = vertical
        ? ctx.createLinearGradient(0, c - l, 0, c + l)
        : ctx.createLinearGradient(c - l, 0, c + l, 0);
      grad.addColorStop(0, 'rgba(255,255,255,0)');
      grad.addColorStop(0.5, 'rgba(255,255,255,.75)');
      grad.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = grad;
      if (vertical) ctx.fillRect(c - w / 2, c - l, w, l * 2);
      else ctx.fillRect(c - l, c - w / 2, l * 2, w);
    }
  }
  return toTexture(canvas);
}

/** Irregular soft blotch — nebula billboards. */
export function nebulaTexture(size = 256, seed = 1): CanvasTexture {
  const [canvas, ctx] = canvasOf(size);
  let state = seed >>> 0 || 1;
  const random = () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
  ctx.globalCompositeOperation = 'lighter';
  for (let blob = 0; blob < 9; blob++) {
    const x = size * (0.28 + random() * 0.44);
    const y = size * (0.28 + random() * 0.44);
    const r = size * (0.14 + random() * 0.24);
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, 'rgba(255,255,255,.16)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
  }
  return toTexture(canvas);
}

/** 1D radial alpha bands for planet rings. RingGeometry UVs get remapped so
 * u runs inner→outer; this texture is sampled along u. */
export function ringTexture(size = 256): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = 4;
  const ctx = canvas.getContext('2d')!;
  // [start, end, alpha] fractions of the ring's radial span — fixed, deterministic.
  const bands: Array<[number, number, number]> = [
    [0.02, 0.16, 0.55], [0.2, 0.3, 0.3], [0.34, 0.52, 0.7],
    [0.56, 0.6, 0.25], [0.66, 0.84, 0.5], [0.88, 0.96, 0.3],
  ];
  for (const [start, end, alpha] of bands) {
    ctx.fillStyle = `rgba(255,255,255,${alpha})`;
    ctx.fillRect(size * start, 0, size * (end - start), 4);
  }
  return toTexture(canvas);
}

/** Soft diagonal band of layered blotches — the milky-way backdrop. */
export function milkyWayTexture(width = 1024, height = 256): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  let state = 7;
  const random = () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
  ctx.globalCompositeOperation = 'lighter';
  for (let blob = 0; blob < 60; blob++) {
    const x = width * random();
    const y = height * (0.35 + random() * 0.3 + Math.sin((x / width) * Math.PI) * 0.1);
    const r = height * (0.12 + random() * 0.3);
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    const warm = random() > 0.7;
    g.addColorStop(0, warm ? 'rgba(255,236,210,.10)' : 'rgba(214,226,255,.10)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, width, height);
  }
  return toTexture(canvas);
}
