// engine/app/(site)/universe/scene/planets.ts
// The sun (the week's top member) and the named-world planets as real meshes with
// procedural shaders. Planets follow the star buffers' live positions each
// frame so mode transitions (orbit rings, etc.) move them like everyone else.
import {
  AdditiveBlending, DoubleSide, Group, Mesh, MeshBasicMaterial, RingGeometry,
  ShaderMaterial, SphereGeometry, Sprite, SpriteMaterial,
} from 'three';
import type { UniverseGraph } from '@/lib/universe/types';
import { planetSpecs, SUN_RADIUS, type PlanetSpec } from './starAttributes';
import { glowTexture, ringTexture } from './textures';

export type PlanetarySystem = {
  group: Group;
  update(now: number, motion: number, livePosition: Float32Array, liveDim: Float32Array): void;
  /** World-space body radius for hit-testing/labels; 0 for non-worlds. */
  radiusOf(id: string): number;
  dispose(): void;
};

const NOISE_GLSL = /* glsl */ `
float hash2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash2(i), hash2(i + vec2(1.0, 0.0)), u.x),
             mix(hash2(i + vec2(0.0, 1.0)), hash2(i + vec2(1.0, 1.0)), u.x), u.y);
}`;

const BODY_VERTEX = /* glsl */ `
varying vec3 vNormal;
varying vec3 vWorldPos;
void main() {
  vNormal = normalize(mat3(modelMatrix) * normal);
  vec4 world = modelMatrix * vec4(position, 1.0);
  vWorldPos = world.xyz;
  gl_Position = projectionMatrix * viewMatrix * world;
}`;

const PLANET_FRAGMENT = /* glsl */ `
uniform vec3 uColorA;
uniform vec3 uColorB;
uniform vec3 uRim;
uniform float uBands;
uniform float uPhase;
uniform float uDim;
uniform float uSpin;
varying vec3 vNormal;
varying vec3 vWorldPos;
${NOISE_GLSL}
void main() {
  vec3 n = normalize(vNormal);
  float lat = asin(clamp(n.y, -1.0, 1.0));
  float lon = atan(n.z, n.x) + uSpin;
  float warp = vnoise(vec2(lon * 2.0, lat * 3.0)) * 0.55
             + vnoise(vec2(lon * 5.0, lat * 7.0)) * 0.25;
  float band = 0.5 + 0.5 * sin(lat * uBands * 3.14159 + uPhase * 6.2832 + warp * 2.2);
  vec3 surface = mix(uColorA, uColorB, band);
  vec3 toSun = normalize(-vWorldPos);            // lit by the sun at the origin
  float diffuse = 0.34 + 0.56 * max(0.0, dot(n, toSun));
  vec3 view = normalize(cameraPosition - vWorldPos);
  float fresnel = pow(1.0 - max(0.0, dot(view, n)), 2.6);
  vec3 color = surface * diffuse + uRim * fresnel * 0.38;
  gl_FragColor = vec4(min(color, vec3(0.92)) * uDim, 1.0);
}`;

const SUN_FRAGMENT = /* glsl */ `
uniform float uTime;
uniform float uMotion;
uniform float uDim;
varying vec3 vNormal;
varying vec3 vWorldPos;
${NOISE_GLSL}
void main() {
  vec3 n = normalize(vNormal);
  float lat = asin(clamp(n.y, -1.0, 1.0));
  float lon = atan(n.z, n.x);
  float t = uTime * 0.06 * uMotion;
  float g = vnoise(vec2(lon * 3.0 + t, lat * 4.0 - t)) * 0.6
          + vnoise(vec2(lon * 8.0 - t * 1.7, lat * 9.0 + t)) * 0.4;
  vec3 hot = vec3(1.0, 0.78, 0.32);
  vec3 gold = vec3(0.92, 0.24, 0.035);
  float cells = smoothstep(0.22, 0.86, g);
  vec3 color = mix(hot, gold, cells) * (0.72 + g * 0.25);
  gl_FragColor = vec4(color * max(0.25, uDim), 1.0);
}`;

/** Remap RingGeometry's planar UVs so u = radial position inner→outer. */
function radializeRingUvs(geometry: RingGeometry, inner: number, outer: number): void {
  const pos = geometry.getAttribute('position');
  const uv = geometry.getAttribute('uv');
  for (let i = 0; i < pos.count; i++) {
    const r = Math.hypot(pos.getX(i), pos.getY(i));
    uv.setXY(i, (r - inner) / (outer - inner), 0.5);
  }
  uv.needsUpdate = true;
}

export function createPlanetarySystem(graph: UniverseGraph, index: Map<string, number>, worldScale = 1): PlanetarySystem {
  const displayScale = Math.max(0.35, Math.min(1, worldScale));
  const group = new Group();
  const disposables: Array<{ dispose(): void }> = [];
  const track = <T extends { dispose(): void }>(item: T): T => { disposables.push(item); return item; };
  const radii = new Map<string, number>();

  // --- sun ---
  const sunNode = graph.nodes.find(n => n.celestial === 'sun') ?? null;
  const sunUniforms = { uTime: { value: 0 }, uMotion: { value: 1 }, uDim: { value: 1 } };
  const sunHolder = new Group();
  sunHolder.scale.setScalar(displayScale);
  let sunIndex = -1;
  if (sunNode) {
    sunIndex = index.get(sunNode.id) ?? -1;
    radii.set(sunNode.id, SUN_RADIUS * displayScale);
    const sunMaterial = track(new ShaderMaterial({
      vertexShader: BODY_VERTEX, fragmentShader: SUN_FRAGMENT, uniforms: sunUniforms,
    }));
    const sun = new Mesh(track(new SphereGeometry(SUN_RADIUS, 48, 32)), sunMaterial);
    sunHolder.add(sun);
    const glow = track(glowTexture());
    for (const [scale, color, opacity] of [[SUN_RADIUS * 4.2, '#ff9d37', 0.13], [SUN_RADIUS * 2.05, '#ffd07a', 0.2]] as const) {
      const material = track(new SpriteMaterial({ map: glow, color, transparent: true, opacity, depthWrite: false, blending: AdditiveBlending }));
      const corona = new Sprite(material);
      corona.scale.setScalar(scale);
      sunHolder.add(corona);
    }
    group.add(sunHolder);
  }

  // --- planets ---
  const ring = track(ringTexture());
  const specs = planetSpecs(graph);
  const bodies: Array<{ holder: Group; uniforms: Record<string, { value: number }>; index: number; spec: PlanetSpec }> = [];
  for (const spec of specs.values()) {
    const i = index.get(spec.id);
    if (i == null) continue;
    radii.set(spec.id, spec.radius * displayScale);
    const uniforms = {
      uColorA: { value: spec.colorA }, uColorB: { value: spec.colorB },
      uRim: { value: spec.colorB }, uBands: { value: spec.bandCount },
      uPhase: { value: spec.bandPhase }, uDim: { value: 1 }, uSpin: { value: 0 },
    };
    const material = track(new ShaderMaterial({
      vertexShader: BODY_VERTEX, fragmentShader: PLANET_FRAGMENT,
      uniforms: uniforms as never,
    }));
    const holder = new Group();
    holder.scale.setScalar(displayScale);
    holder.add(new Mesh(track(new SphereGeometry(spec.radius, 32, 24)), material));
    if (spec.ringed) {
      const inner = spec.radius * 1.5;
      const outer = spec.radius * 2.3;
      const geometry = track(new RingGeometry(inner, outer, 48));
      radializeRingUvs(geometry, inner, outer);
      const ringMaterial = track(new MeshBasicMaterial({
        map: ring, color: `rgb(${Math.round(spec.colorB[0] * 255)},${Math.round(spec.colorB[1] * 255)},${Math.round(spec.colorB[2] * 255)})`,
        transparent: true, side: DoubleSide, depthWrite: false, opacity: 0.75,
      }));
      const ringMesh = new Mesh(geometry, ringMaterial);
      ringMesh.rotation.x = Math.PI / 2;
      holder.add(ringMesh);
    }
    holder.rotation.z = spec.axisTilt;
    group.add(holder);
    bodies.push({ holder, uniforms: uniforms as never, index: i, spec });
  }

  return {
    group,
    update(now, motion, livePosition, liveDim) {
      sunUniforms.uTime.value = now / 1000;
      sunUniforms.uMotion.value = motion;
      if (sunIndex >= 0) {
        sunUniforms.uDim.value = liveDim[sunIndex] ?? 1;
        sunHolder.position.set(livePosition[sunIndex * 3]!, livePosition[sunIndex * 3 + 1]!, livePosition[sunIndex * 3 + 2]!);
      }
      for (const body of bodies) {
        const i = body.index;
        body.holder.position.set(livePosition[i * 3]!, livePosition[i * 3 + 1]!, livePosition[i * 3 + 2]!);
        body.uniforms.uDim!.value = liveDim[i] ?? 1;
        body.uniforms.uSpin!.value = (now / 1000) * body.spec.spinSpeed * motion;
      }
    },
    radiusOf: (id) => radii.get(id) ?? 0,
    dispose() {
      for (const item of disposables) item.dispose();
    },
  };
}
