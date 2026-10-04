// engine/app/(site)/universe/scene/GalaxyScene.ts
import {
  AdditiveBlending, BufferAttribute, BufferGeometry, Color, Group, Mesh,
  LineSegments, PerspectiveCamera, Points, QuadraticBezierCurve3, Scene, ShaderMaterial,
  Sprite, SpriteMaterial, TubeGeometry, Vector2, Vector3, WebGLRenderer,
} from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import type { UniverseGraph } from '@/lib/universe/types';
import { CameraRig } from './CameraRig';
import { chooseLabels, pickStar, type ProjectedStar } from './labels';
import {
  AMBIENT_EDGE_CAP, ambientLevel, buildStarBuffers, computeTargets, hexToRgb,
  historyMaxima, pickAmbientEdges, stableUnit,
  type SceneState, type SceneTargets,
} from './starAttributes';
import { createPlanetarySystem } from './planets';
import { glowTexture, milkyWayTexture, nebulaTexture, spikeTexture } from './textures';

export type GalaxySceneHandle = { setState(state: SceneState): void; dispose(): void };

const STAR_VERTEX = /* glsl */ `
attribute float aSize;
attribute vec3 aColor;
attribute float aPhase;
attribute float aDim;
uniform float uTime;
uniform float uMotion;
uniform float uScale;
varying vec3 vColor;
varying float vAlpha;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  float twinkle = 0.82 + 0.18 * sin(uTime * 1.6 * uMotion + aPhase * 21.0);
  gl_PointSize = min(160.0, aSize * twinkle * uScale / max(40.0, -mv.z));
  vColor = aColor;
  vAlpha = aDim * (0.72 + 0.28 * twinkle);
  gl_Position = projectionMatrix * mv;
}`;

const STAR_FRAGMENT = /* glsl */ `
uniform sampler2D uSprite;
varying vec3 vColor;
varying float vAlpha;
void main() {
  vec4 tex = texture2D(uSprite, gl_PointCoord);
  vec4 color = vec4(vColor * tex.rgb, tex.a) * vAlpha;
  if (color.a < 0.004) discard;
  gl_FragColor = color;
}`;

const BEAM_VERTEX = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const BEAM_FRAGMENT = /* glsl */ `
uniform vec3 uColor;
uniform float uTime;
uniform float uMotion;
uniform float uStrength;
varying vec2 vUv;
void main() {
  float across = smoothstep(0.0, 0.35, vUv.y) * smoothstep(1.0, 0.65, vUv.y);
  float ends = smoothstep(0.0, 0.06, vUv.x) * smoothstep(1.0, 0.94, vUv.x);
  float pulse = 0.62 + 0.38 * sin(vUv.x * 30.0 - uTime * 2.6 * uMotion);
  gl_FragColor = vec4(uColor, across * ends * uStrength * pulse);
}`;

const AMBIENT_VERTEX = /* glsl */ `
attribute vec3 aColor;
attribute float aStrength;
attribute float aCluster;
uniform float uAmbient;
uniform float uCluster;
varying vec3 vColor;
varying float vAlpha;
void main() {
  vColor = aColor;
  float clusterBoost = uCluster < -0.5 ? 1.0 : (abs(aCluster - uCluster) < 0.5 ? 1.0 : 0.08);
  vAlpha = uAmbient * clusterBoost * (0.075 + aStrength * 0.12);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const AMBIENT_FRAGMENT = /* glsl */ `
varying vec3 vColor;
varying float vAlpha;
void main() {
  if (vAlpha < 0.002) discard;
  gl_FragColor = vec4(vColor, vAlpha);
}`;

type Quality = 0 | 1 | 2; // 0 full bloom · 1 no bloom · 2 no bloom + thinner deep field

export function createGalaxyScene(opts: {
  canvas: HTMLCanvasElement;
  labelCanvas: HTMLCanvasElement;
  graph: UniverseGraph;
  onSelect: (id: string) => void;
  onFallback: () => void;
}): GalaxySceneHandle {
  const { canvas, labelCanvas, graph } = opts;
  const coarse = window.matchMedia('(pointer: coarse)').matches;
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const spatialScale = coarse ? 1.38 : 1;
  const worldScale = coarse ? 0.62 : 1;
  const labelCtx = labelCanvas.getContext('2d');

  let renderer: WebGLRenderer;
  try {
    renderer = new WebGLRenderer({ canvas, antialias: false, alpha: false, powerPreference: 'high-performance' });
  } catch {
    opts.onFallback();
    return { setState: () => {}, dispose: () => {} };
  }
  // A 1.25 DPR cap made the scene visibly soft on 2x/3x phone displays. Two
  // physical pixels per CSS pixel is still roughly the same render area as
  // the desktop audit viewport, while making planet bands and labels crisp.
  const dprCap = coarse ? 2 : 1.75;
  renderer.setPixelRatio(Math.min(dprCap, window.devicePixelRatio || 1));
  renderer.setClearColor(new Color('#030409'), 1);

  const scene = new Scene();
  const camera = new PerspectiveCamera(55, 1, 2, 24000);
  const rig = new CameraRig(camera);
  const disposables: Array<{ dispose(): void }> = [];
  const track = <T extends { dispose(): void }>(item: T): T => { disposables.push(item); return item; };

  // --- background starfield: far shell + near shell + hero spikes ---
  // mulberry32 stream: sequential `bg:${i}` FNV hashes correlate and draw
  // visible star "strings" across the sky — a seeded PRNG stream doesn't.
  let seed = 0x9e3779b9;
  const next = () => {
    seed = (seed + 0x6d2b79f5) >>> 0;
    let t = seed;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const fillShell = (geometry: BufferGeometry, count: number, opts: {
    rMin: number; rMax: number; sMin: number; sMax: number; dim: number; colorful: boolean;
  }) => {
    const pos = new Float32Array(count * 3);
    const col = new Float32Array(count * 3);
    const size = new Float32Array(count);
    const phase = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      const u = next() * 2 - 1;
      const theta = next() * Math.PI * 2;
      const r = opts.rMin + next() * (opts.rMax - opts.rMin);
      const s = Math.sqrt(1 - u * u);
      pos[i * 3] = Math.cos(theta) * s * r;
      pos[i * 3 + 1] = u * r * 0.62;
      pos[i * 3 + 2] = Math.sin(theta) * s * r;
      const warm = next();
      if (opts.colorful && warm > 0.86) {
        const blue = next() > 0.5;
        col[i * 3] = blue ? 0.62 : 1;
        col[i * 3 + 1] = blue ? 0.74 : 0.78;
        col[i * 3 + 2] = blue ? 1 : 0.55;
      } else {
        col[i * 3] = 0.68 + warm * 0.3;
        col[i * 3 + 1] = 0.74 + warm * 0.2;
        col[i * 3 + 2] = 0.92;
      }
      size[i] = opts.sMin + next() * (opts.sMax - opts.sMin);
      phase[i] = next();
    }
    geometry.setAttribute('position', new BufferAttribute(pos, 3));
    geometry.setAttribute('aColor', new BufferAttribute(col, 3));
    geometry.setAttribute('aSize', new BufferAttribute(size, 1));
    geometry.setAttribute('aPhase', new BufferAttribute(phase, 1));
    geometry.setAttribute('aDim', new BufferAttribute(new Float32Array(count).fill(opts.dim), 1));
  };
  const bgCount = 4500;
  const bgGeometry = track(new BufferGeometry());
  fillShell(bgGeometry, bgCount, { rMin: 6800, rMax: 9400, sMin: 3, sMax: 8, dim: 0.5, colorful: false });
  const nearGeometry = track(new BufferGeometry());
  fillShell(nearGeometry, 1200, { rMin: 5200, rMax: 6400, sMin: 6, sMax: 14, dim: 0.7, colorful: true });
  const heroGeometry = track(new BufferGeometry());
  fillShell(heroGeometry, 40, { rMin: 5600, rMax: 6800, sMin: 16, sMax: 26, dim: 0.85, colorful: true });

  const glow = track(glowTexture());
  const spike = track(spikeTexture());
  const nebula = track(nebulaTexture(256, 7));

  const starUniforms = { uTime: { value: 0 }, uMotion: { value: reduced ? 0 : 1 }, uScale: { value: 620 }, uSprite: { value: glow } };
  const makeStarMaterial = (sprite: typeof glow) => track(new ShaderMaterial({
    vertexShader: STAR_VERTEX,
    fragmentShader: STAR_FRAGMENT,
    uniforms: { uTime: starUniforms.uTime, uMotion: starUniforms.uMotion, uScale: starUniforms.uScale, uSprite: { value: sprite } },
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
  }));

  const bgPoints = new Points(bgGeometry, makeStarMaterial(glow));
  bgPoints.frustumCulled = false;
  scene.add(bgPoints);

  const nearPoints = new Points(nearGeometry, makeStarMaterial(glow));
  nearPoints.frustumCulled = false;
  scene.add(nearPoints);
  const heroPoints = new Points(heroGeometry, makeStarMaterial(spike));
  heroPoints.frustumCulled = false;
  scene.add(heroPoints);
  const milkyWay = track(milkyWayTexture());
  const milkyMaterial = track(new SpriteMaterial({ map: milkyWay, transparent: true, opacity: 0.07, depthWrite: false, blending: AdditiveBlending }));
  const milkySprite = new Sprite(milkyMaterial);
  milkySprite.scale.set(15000, 4200, 1);
  milkySprite.position.set(0, 900, -7800);
  scene.add(milkySprite);

  // --- member stars ---
  const buffers = buildStarBuffers(graph);
  if (spatialScale !== 1) {
    for (let i = 0; i < buffers.position.length; i++) buffers.position[i] = buffers.position[i]! * spatialScale;
  }
  const maxima = historyMaxima(graph);
  const count = buffers.ids.length;
  const livePosition = new Float32Array(buffers.position);
  const liveDim = new Float32Array(count).fill(1);
  const targetPosition = new Float32Array(buffers.position);
  const targetDim = new Float32Array(count).fill(1);

  const fieldGeometry = track(new BufferGeometry());
  fieldGeometry.setAttribute('position', new BufferAttribute(livePosition, 3));
  fieldGeometry.setAttribute('aColor', new BufferAttribute(buffers.color, 3));
  fieldGeometry.setAttribute('aSize', new BufferAttribute(buffers.size, 1));
  fieldGeometry.setAttribute('aPhase', new BufferAttribute(buffers.phase, 1));
  fieldGeometry.setAttribute('aDim', new BufferAttribute(liveDim, 1));
  const fieldPoints = new Points(fieldGeometry, makeStarMaterial(glow));
  fieldPoints.frustumCulled = false;
  scene.add(fieldPoints);

  // --- sun + planets ---
  const planetary = createPlanetarySystem(graph, buffers.index, worldScale);
  scene.add(planetary.group);

  // --- nebula billboards along each community ---
  const clusterMembers = new Map<number, string[]>();
  for (const node of graph.nodes) {
    if (!clusterMembers.has(node.cluster)) clusterMembers.set(node.cluster, []);
    clusterMembers.get(node.cluster)!.push(node.id);
  }
  for (const cluster of graph.clusters) {
    const members = clusterMembers.get(cluster.id) ?? [];
    if (members.length < 3) continue;
    const sorted = [...members].sort((a, b) => {
      const pa = buffers.index.get(a)!;
      const pb = buffers.index.get(b)!;
      const ra = Math.hypot(buffers.position[pa * 3]!, buffers.position[pa * 3 + 2]!);
      const rb = Math.hypot(buffers.position[pb * 3]!, buffers.position[pb * 3 + 2]!);
      return ra - rb;
    });
    for (const q of [0.25, 0.55, 0.85]) {
      const id = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))]!;
      const i = buffers.index.get(id)!;
      const material = track(new SpriteMaterial({
        map: nebula, color: cluster.color, transparent: true,
        opacity: 0.07, depthWrite: false, blending: AdditiveBlending,
      }));
      const sprite = new Sprite(material);
      sprite.position.set(buffers.position[i * 3]!, buffers.position[i * 3 + 1]! * 0.4, buffers.position[i * 3 + 2]!);
      sprite.scale.setScalar(80 + stableUnit(`${cluster.id}:${q}`) * 76);
      scene.add(sprite);
    }
  }

  // --- connection beams ---
  const beamGroup = new Group();
  scene.add(beamGroup);
  let beamMeshes: Mesh[] = [];
  let beamFade = 0; // eases 0→1 after each rebuild
  const rebuildBeams = (targets: SceneTargets) => {
    for (const mesh of beamMeshes) {
      beamGroup.remove(mesh);
      mesh.geometry.dispose();
      (mesh.material as ShaderMaterial).dispose();
    }
    beamMeshes = [];
    const clusterColorOf = new Map(graph.clusters.map(c => [c.id, hexToRgb(c.color)]));
    for (const edge of targets.beams.slice(0, coarse ? 8 : targets.beams.length)) {
      const ia = buffers.index.get(edge.a);
      const ib = buffers.index.get(edge.b);
      if (ia == null || ib == null) continue;
      const a = new Vector3(targetPosition[ia * 3]!, targetPosition[ia * 3 + 1]!, targetPosition[ia * 3 + 2]!);
      const b = new Vector3(targetPosition[ib * 3]!, targetPosition[ib * 3 + 1]!, targetPosition[ib * 3 + 2]!);
      const mid = a.clone().add(b).multiplyScalar(0.5);
      mid.y += a.distanceTo(b) * 0.16 + 24;
      const curve = new QuadraticBezierCurve3(a, mid, b);
      const nodeA = graph.nodes[ia]!;
      const rgb = clusterColorOf.get(nodeA.cluster) ?? [0.72, 0.75, 0.95];
      const material = new ShaderMaterial({
        vertexShader: BEAM_VERTEX,
        fragmentShader: BEAM_FRAGMENT,
        uniforms: {
          uColor: { value: new Color(rgb[0], rgb[1], rgb[2]).lerp(new Color('#ffffff'), 0.35) },
          uTime: starUniforms.uTime,
          uMotion: starUniforms.uMotion,
          uStrength: { value: 0 },
        },
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
      });
      const beamRadius = (0.55 + edge.strength * 0.85) * (coarse ? 0.65 : 1);
      const mesh = new Mesh(new TubeGeometry(curve, 36, beamRadius, 5, false), material);
      mesh.userData.strength = 0.16 + edge.strength * 0.3;
      beamGroup.add(mesh);
      beamMeshes.push(mesh);
    }
    beamFade = 0;
  };

  // --- ambient connection layer: one merged draw call, always present ---
  const ambientUniforms = { uAmbient: { value: 1 }, uCluster: { value: -1 } };
  {
    const clusterOfNode = new Map(graph.nodes.map(n => [n.id, n.cluster]));
    const clusterRgb = new Map(graph.clusters.map(c => [c.id, hexToRgb(c.color)]));
    const ambient = pickAmbientEdges(graph.edges, coarse ? AMBIENT_EDGE_CAP.coarse : AMBIENT_EDGE_CAP.fine);
    const SEGMENTS = 12;
    const vertsPerEdge = SEGMENTS * 2;
    const pos = new Float32Array(ambient.length * vertsPerEdge * 3);
    const col = new Float32Array(ambient.length * vertsPerEdge * 3);
    const str = new Float32Array(ambient.length * vertsPerEdge);
    const clu = new Float32Array(ambient.length * vertsPerEdge);
    const a = new Vector3();
    const b = new Vector3();
    const mid = new Vector3();
    let v = 0;
    for (const edge of ambient) {
      const ia = buffers.index.get(edge.a);
      const ib = buffers.index.get(edge.b);
      if (ia == null || ib == null) continue;
      a.set(buffers.position[ia * 3]!, buffers.position[ia * 3 + 1]!, buffers.position[ia * 3 + 2]!);
      b.set(buffers.position[ib * 3]!, buffers.position[ib * 3 + 1]!, buffers.position[ib * 3 + 2]!);
      mid.copy(a).add(b).multiplyScalar(0.5);
      mid.y += a.distanceTo(b) * 0.12 + 18;
      const curve = new QuadraticBezierCurve3(a.clone(), mid.clone(), b.clone());
      const pointsOnCurve = curve.getPoints(SEGMENTS);
      const ca = clusterRgb.get(clusterOfNode.get(edge.a) ?? -1) ?? [0.7, 0.75, 0.95];
      const cb = clusterRgb.get(clusterOfNode.get(edge.b) ?? -1) ?? [0.7, 0.75, 0.95];
      const sameCluster = clusterOfNode.get(edge.a) === clusterOfNode.get(edge.b)
        ? (clusterOfNode.get(edge.a) ?? -1) : -1;
      for (let s = 0; s < SEGMENTS; s++) {
        for (const [point, t] of [[pointsOnCurve[s]!, s / SEGMENTS], [pointsOnCurve[s + 1]!, (s + 1) / SEGMENTS]] as const) {
          pos[v * 3] = point.x; pos[v * 3 + 1] = point.y; pos[v * 3 + 2] = point.z;
          col[v * 3] = ca[0]! + (cb[0]! - ca[0]!) * t;
          col[v * 3 + 1] = ca[1]! + (cb[1]! - ca[1]!) * t;
          col[v * 3 + 2] = ca[2]! + (cb[2]! - ca[2]!) * t;
          str[v] = edge.strength;
          clu[v] = sameCluster;
          v++;
        }
      }
    }
    const geometry = track(new BufferGeometry());
    geometry.setAttribute('position', new BufferAttribute(pos.subarray(0, v * 3), 3));
    geometry.setAttribute('aColor', new BufferAttribute(col.subarray(0, v * 3), 3));
    geometry.setAttribute('aStrength', new BufferAttribute(str.subarray(0, v), 1));
    geometry.setAttribute('aCluster', new BufferAttribute(clu.subarray(0, v), 1));
    const material = track(new ShaderMaterial({
      vertexShader: AMBIENT_VERTEX, fragmentShader: AMBIENT_FRAGMENT,
      uniforms: ambientUniforms, transparent: true, depthWrite: false, blending: AdditiveBlending,
    }));
    const lines = new LineSegments(geometry, material);
    lines.frustumCulled = false;
    scene.add(lines);
  }

  // --- composer + adaptive quality ---
  let composer: EffectComposer | null = null;
  let bloom: UnrealBloomPass | null = null;
  let quality: Quality = 0;
  const setupComposer = (width: number, height: number) => {
    composer?.dispose();
    bloom?.dispose();
    composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    const scale = coarse ? 0.5 : 1;
    bloom = new UnrealBloomPass(new Vector2(Math.max(1, width * scale), Math.max(1, height * scale)), 0.24, 0.32, 0.68);
    composer.addPass(bloom);
  };

  // --- sizing ---
  let width = 1;
  let height = 1;
  const resize = () => {
    const rect = canvas.parentElement?.getBoundingClientRect();
    width = Math.max(1, rect?.width ?? 1);
    height = Math.max(1, rect?.height ?? 1);
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    const pointScale = coarse ? 540 : 620;
    starUniforms.uScale.value = pointScale * Math.min(dprCap, window.devicePixelRatio || 1);
    const labelDpr = Math.min(coarse ? 2 : 1.75, window.devicePixelRatio || 1);
    labelCanvas.width = Math.round(width * labelDpr);
    labelCanvas.height = Math.round(height * labelDpr);
    labelCtx?.setTransform(labelDpr, 0, 0, labelDpr, 0, 0);
    if (quality === 0) setupComposer(width, height);
    dirty = true;
  };
  const observer = new ResizeObserver(resize);
  observer.observe(canvas.parentElement ?? canvas);

  // --- state / targets ---
  let state: SceneState = { mode: 'overview', selectedId: null, orbitRoot: null, clusterId: null, relationship: null, timeIndex: -1 };
  let dirty = true;
  const applyState = (next: SceneState) => {
    state = next;
    const targets = computeTargets(graph, buffers, state, maxima, spatialScale);
    targetPosition.set(targets.position);
    targetDim.set(targets.dim);
    rebuildBeams(targets);
    const ambient = ambientLevel(state);
    ambientUniforms.uAmbient.value = ambient.amb;
    ambientUniforms.uCluster.value = ambient.cluster;
    const portrait = coarse && height > width;
    // Phones intentionally see a cropped slice of the wider system.
    // Sideways dragging then reveals the rest instead of compressing every
    // world and label into the initial portrait frame.
    const portraitScale = state.mode === 'orbit' ? 1.08 : 1.02;
    rig.flyTo({
      focus: targets.camera.focus,
      distance: targets.camera.distance * (portrait ? portraitScale : 1),
      pitch: targets.camera.pitch,
    }, reduced ? 1 : 900);
    dirty = true;
  };

  // --- projection map for labels + picking ---
  const projected = new Map<string, ProjectedStar>();
  const projectVector = new Vector3();
  const refreshProjection = () => {
    projected.clear();
    const fovFactor = height / (2 * Math.tan((camera.fov * Math.PI) / 360));
    for (let i = 0; i < count; i++) {
      const wx = livePosition[i * 3]!;
      const wy = livePosition[i * 3 + 1]!;
      const wz = livePosition[i * 3 + 2]!;
      projectVector.set(wx, wy, wz);
      const dist = Math.max(1, camera.position.distanceTo(projectVector));
      projectVector.project(camera);
      if (projectVector.z > 1) continue; // behind camera
      const id = buffers.ids[i]!;
      const worldRadius = planetary.radiusOf(id);
      const radius = worldRadius > 0
        ? Math.max(10, (worldRadius * fovFactor) / dist)
        : Math.max(3, (buffers.size[i]! * starUniforms.uScale.value * 0.5) / Math.max(40, dist));
      projected.set(id, {
        id,
        x: (projectVector.x * 0.5 + 0.5) * width,
        y: (-projectVector.y * 0.5 + 0.5) * height,
        depth: projectVector.z,
        radius,
        alpha: liveDim[i]!,
      });
    }
  };

  const measure = (text: string, emphasized: boolean): number => {
    if (!labelCtx) return text.length * 7;
    const size = coarse ? (emphasized ? 11 : 10) : (emphasized ? 12 : 10.5);
    labelCtx.font = `${emphasized ? 700 : 620} ${size}px system-ui, sans-serif`;
    return labelCtx.measureText(text).width;
  };

  let hoveredId: string | null = null;
  const fine = window.matchMedia('(pointer: fine)').matches;
  const onHoverMove = (event: PointerEvent) => {
    if (!fine) return;
    const rect = labelCanvas.getBoundingClientRect();
    const hit = pickStar(event.clientX - rect.left, event.clientY - rect.top, projected.values());
    if (hit !== hoveredId) { hoveredId = hit; dirty = true; }
  };
  labelCanvas.addEventListener('pointermove', onHoverMove);

  const drawLabels = () => {
    if (!labelCtx) return;
    labelCtx.clearRect(0, 0, width, height);
    // community names, overview only, when zoomed out
    if (!coarse && state.mode === 'overview' && rig.pose.distance > 1700) {
      for (const cluster of graph.clusters) {
        projectVector.set(cluster.x, cluster.y, cluster.z).project(camera);
        if (projectVector.z > 1) continue;
        const x = (projectVector.x * 0.5 + 0.5) * width;
        const y = (-projectVector.y * 0.5 + 0.5) * height;
        if (x < 40 || x > width - 40 || y < 30 || y > height - 30) continue;
        labelCtx.font = '600 9px ui-monospace, monospace';
        labelCtx.textAlign = 'center';
        labelCtx.fillStyle = `${cluster.color}88`;
        labelCtx.fillText(cluster.name.toUpperCase(), x, y - 46);
      }
    }
    const placed = chooseLabels(graph, state, projected, { width, height, coarse, hoveredId }, measure);
    for (const item of placed) {
      labelCtx.textAlign = 'center';
      labelCtx.lineJoin = 'round';
      if (item.nudged) {
        labelCtx.strokeStyle = 'rgba(180,200,255,.35)';
        labelCtx.lineWidth = 1;
        labelCtx.beginPath();
        labelCtx.moveTo(item.anchorX, item.anchorY + 2);
        labelCtx.lineTo(item.x, item.y - 10);
        labelCtx.stroke();
      }
      const size = coarse ? (item.emphasized ? 11 : 10) : (item.emphasized ? 12 : 10.5);
      labelCtx.font = `${item.emphasized ? 700 : 620} ${size}px system-ui, sans-serif`;
      labelCtx.strokeStyle = 'rgba(2,4,10,.9)';
      labelCtx.lineWidth = 4;
      labelCtx.strokeText(item.text, item.x, item.y);
      labelCtx.fillStyle = item.emphasized ? '#ffffff' : 'rgba(226,234,255,.82)';
      labelCtx.fillText(item.text, item.x, item.y);
      if (item.sub) {
        labelCtx.font = `${coarse ? 6.5 : 7}px ui-monospace, monospace`;
        labelCtx.fillStyle = 'rgba(150,210,255,.8)';
        labelCtx.fillText(item.sub.toUpperCase(), item.x, item.y + 12);
      }
    }
  };

  // --- frame loop with adaptive quality + reduced-motion render-on-demand ---
  let frame = 0;
  let running = true;
  let previous = 0;
  let frameEma = 16;
  let badFrames = 0;
  let renderFailures = 0;
  const stepQuality = () => {
    if (quality >= 2) return;
    quality = (quality + 1) as Quality;
    if (quality === 1) { composer?.dispose(); bloom?.dispose(); composer = null; bloom = null; }
    if (quality === 2) {
      bgGeometry.setDrawRange(0, Math.floor(bgCount / 2));
      ambientUniforms.uAmbient.value *= 0.5;
    }
    badFrames = 0;
  };

  const loop = (now: number) => {
    frame = running ? requestAnimationFrame(loop) : 0;
    const dt = Math.min(64, now - previous || 16);
    previous = now;
    if (reduced && !dirty) return;

    // perf accounting (skip in reduced motion; it renders rarely)
    if (!reduced) {
      frameEma = frameEma * 0.92 + dt * 0.08;
      if (frameEma > 42) { if (++badFrames > 90) stepQuality(); } else badFrames = 0;
    }

    starUniforms.uTime.value = now / 1000;
    const cameraMoving = rig.update(now, reduced);

    // ease live buffers toward targets
    const k = reduced ? 1 : 1 - Math.pow(0.002, dt / 1000);
    let buffersMoving = false;
    for (let i = 0; i < count; i++) {
      const d = targetDim[i]! - liveDim[i]!;
      if (Math.abs(d) > 0.002) { liveDim[i] = liveDim[i]! + d * k; buffersMoving = true; }
      for (let axis = 0; axis < 3; axis++) {
        const p = targetPosition[i * 3 + axis]! - livePosition[i * 3 + axis]!;
        if (Math.abs(p) > 0.05) { livePosition[i * 3 + axis] = livePosition[i * 3 + axis]! + p * k; buffersMoving = true; }
      }
    }
    if (buffersMoving || dirty) {
      (fieldGeometry.getAttribute('position') as BufferAttribute).needsUpdate = true;
      (fieldGeometry.getAttribute('aDim') as BufferAttribute).needsUpdate = true;
    }
    if (beamFade < 1) {
      beamFade = reduced ? 1 : Math.min(1, beamFade + dt / 420);
      for (const mesh of beamMeshes) {
        ((mesh.material as ShaderMaterial).uniforms.uStrength!).value = (mesh.userData.strength as number) * beamFade;
      }
    }
    planetary.update(now, reduced ? 0 : 1, livePosition, liveDim);

    try {
      if (composer && quality === 0) composer.render();
      else renderer.render(scene, camera);
      renderFailures = 0;
    } catch {
      renderFailures++;
      if (renderFailures >= 3) {
        running = false;
        if (frame) cancelAnimationFrame(frame);
        frame = 0;
        opts.onFallback();
        return;
      }
    }
    refreshProjection();
    drawLabels();
    dirty = cameraMoving || buffersMoving || beamFade < 1;
  };

  // --- interaction, visibility, context loss ---
  rig.attach(labelCanvas, {
    onTap: (x, y) => {
      const hit = pickStar(x, y, projected.values());
      if (hit) opts.onSelect(hit);
    },
    onChange: () => { dirty = true; },
  });

  const onVisibility = () => {
    running = !document.hidden;
    if (running && !frame) { previous = performance.now(); frame = requestAnimationFrame(loop); }
  };
  document.addEventListener('visibilitychange', onVisibility);

  let contextLosses = 0;
  const onContextLost = (event: Event) => {
    event.preventDefault();
    contextLosses++;
    if (contextLosses > 1) { running = false; opts.onFallback(); }
  };
  const onContextRestored = () => { if (contextLosses <= 1) { if (quality === 0) setupComposer(width, height); dirty = true; } };
  canvas.addEventListener('webglcontextlost', onContextLost);
  canvas.addEventListener('webglcontextrestored', onContextRestored);

  resize();
  applyState(state);
  frame = requestAnimationFrame(loop);

  return {
    setState: (next: SceneState) => applyState(next),
    dispose: () => {
      running = false;
      if (frame) cancelAnimationFrame(frame);
      observer.disconnect();
      rig.detach();
      labelCanvas.removeEventListener('pointermove', onHoverMove);
      document.removeEventListener('visibilitychange', onVisibility);
      canvas.removeEventListener('webglcontextlost', onContextLost);
      canvas.removeEventListener('webglcontextrestored', onContextRestored);
      for (const mesh of beamMeshes) { mesh.geometry.dispose(); (mesh.material as ShaderMaterial).dispose(); }
      planetary.dispose();
      for (const item of disposables) item.dispose();
      composer?.dispose();
      bloom?.dispose();
      renderer.dispose();
    },
  };
}
