// Pure scene-data helpers — no three import, fully unit-testable.
import { orbitRingPositions, type Vec3 } from '@/lib/universe/layout';
import type { UniverseEdge, UniverseGraph, UniverseNode } from '@/lib/universe/types';

export type UniverseMode = 'overview' | 'orbit' | 'cluster' | 'relationship';

export type SceneState = {
  mode: UniverseMode;
  selectedId: string | null;
  orbitRoot: string | null;
  clusterId: number | null;
  relationship: UniverseEdge | null;
  timeIndex: number;
};

export type StarBuffers = {
  ids: string[];
  index: Map<string, number>;
  position: Float32Array;
  color: Float32Array;
  size: Float32Array;
  phase: Float32Array;
  /** 1 for named worlds (sun/planet) that render on the spike layer. */
  spikeFlag: Float32Array;
};

export type SceneTargets = {
  position: Float32Array;
  dim: Float32Array;
  beams: UniverseEdge[];
  camera: { focus: Vec3; distance: number; pitch: number };
};

export const MAX_BEAMS = 12;

export function stableUnit(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 4294967296;
}

export function hexToRgb(hex: string): [number, number, number] {
  const value = Number.parseInt(hex.replace('#', ''), 16);
  return [((value >> 16) & 255) / 255, ((value >> 8) & 255) / 255, (value & 255) / 255];
}

const mixToWhite = (rgb: [number, number, number], amount: number): [number, number, number] =>
  [rgb[0] + (1 - rgb[0]) * amount, rgb[1] + (1 - rgb[1]) * amount, rgb[2] + (1 - rgb[2]) * amount];

export function starSize(node: UniverseNode): number {
  if (node.celestial !== 'star') return 0; // sun + planets render as real meshes (planets.ts)
  return 10 + node.prominence * 20;
}

export function buildStarBuffers(graph: UniverseGraph): StarBuffers {
  const clusterColor = new Map(graph.clusters.map(c => [c.id, hexToRgb(c.color)]));
  const count = graph.nodes.length;
  const buffers: StarBuffers = {
    ids: graph.nodes.map(n => n.id),
    index: new Map(graph.nodes.map((n, i) => [n.id, i])),
    position: new Float32Array(count * 3),
    color: new Float32Array(count * 3),
    size: new Float32Array(count),
    phase: new Float32Array(count),
    spikeFlag: new Float32Array(count),
  };
  graph.nodes.forEach((node, i) => {
    buffers.position[i * 3] = node.x;
    buffers.position[i * 3 + 1] = node.y;
    buffers.position[i * 3 + 2] = node.z;
    const base = clusterColor.get(node.cluster) ?? ([0.86, 0.9, 1] as [number, number, number]);
    // Deep field trends near-white; named worlds keep more community hue.
    const whiteMix = node.celestial === 'star' ? 0.24 + stableUnit(`${node.id}:w`) * 0.24 : 0.18;
    const [r, g, b] = mixToWhite(base, whiteMix);
    buffers.color[i * 3] = r;
    buffers.color[i * 3 + 1] = g;
    buffers.color[i * 3 + 2] = b;
    buffers.size[i] = starSize(node);
    buffers.phase[i] = stableUnit(node.id);
    buffers.spikeFlag[i] = node.celestial === 'star' ? 0 : 1;
  });
  return buffers;
}

export function historyMaxima(graph: UniverseGraph): number[] {
  return graph.timeline.map((_, index) =>
    Math.max(1, ...graph.nodes.map(node => node.history[index] ?? 0)));
}

export function timeFactor(node: UniverseNode, timeIndex: number, historyMax: number[]): number {
  if (timeIndex < 0 || historyMax.length === 0) return 1;
  const value = node.history[timeIndex] ?? 0;
  if (value <= 0) return 0.08;
  const max = historyMax[timeIndex] ?? 1;
  return Math.min(1.2, Math.max(0.24, 0.24 + Math.log1p(value) / Math.log1p(max)));
}

function edgesOf(graph: UniverseGraph, id: string): UniverseEdge[] {
  return graph.edges
    .filter(edge => edge.a === id || edge.b === id)
    .sort((a, b) => b.interactions - a.interactions || a.id.localeCompare(b.id));
}

const positionOf = (buffers: StarBuffers, id: string): Vec3 => {
  const i = buffers.index.get(id)!;
  return { x: buffers.position[i * 3]!, y: buffers.position[i * 3 + 1]!, z: buffers.position[i * 3 + 2]! };
};

export function computeTargets(
  graph: UniverseGraph,
  buffers: StarBuffers,
  state: SceneState,
  historyMax: number[],
  spatialScale = 1,
): SceneTargets {
  const count = graph.nodes.length;
  const position = new Float32Array(buffers.position);
  const dim = new Float32Array(count);
  graph.nodes.forEach((node, i) => { dim[i] = timeFactor(node, state.timeIndex, historyMax); });

  let beams: UniverseEdge[] = [];
  let camera: SceneTargets['camera'] = { focus: { x: 0, y: 0, z: 0 }, distance: 1780, pitch: 0.68 };

  if (state.mode === 'orbit' && state.orbitRoot && buffers.index.has(state.orbitRoot)) {
    const root = state.orbitRoot;
    const rootPos = positionOf(buffers, root);
    const rootEdges = edgesOf(graph, root);
    const neighbors = rootEdges.map(e => (e.a === root ? e.b : e.a)).filter(id => buffers.index.has(id));
    const offsets = orbitRingPositions(neighbors.length).map(offset => ({
      x: offset.x * spatialScale,
      y: offset.y * spatialScale,
      z: offset.z * spatialScale,
    }));
    const ringMembers = neighbors.slice(0, offsets.length);
    ringMembers.forEach((id, n) => {
      const i = buffers.index.get(id)!;
      position[i * 3] = rootPos.x + offsets[n]!.x;
      position[i * 3 + 1] = rootPos.y + offsets[n]!.y;
      position[i * 3 + 2] = rootPos.z + offsets[n]!.z;
    });
    const participants = new Set([root, ...ringMembers]);
    graph.nodes.forEach((node, i) => { if (!participants.has(node.id)) dim[i] = Math.min(dim[i]!, 0.06); });
    beams = rootEdges.filter(e => {
      const other = e.a === root ? e.b : e.a;
      return participants.has(other);
    }).slice(0, MAX_BEAMS);
    camera = { focus: rootPos, distance: 820, pitch: 0.68 };
  } else if (state.mode === 'relationship' && state.relationship
      && buffers.index.has(state.relationship.a) && buffers.index.has(state.relationship.b)) {
    const { a, b } = state.relationship;
    const pa = positionOf(buffers, a);
    const pb = positionOf(buffers, b);
    graph.nodes.forEach((node, i) => {
      if (node.id !== a && node.id !== b) dim[i] = Math.min(dim[i]!, 0.04);
      else dim[i] = 1;
    });
    beams = [state.relationship];
    const span = Math.hypot(pa.x - pb.x, pa.y - pb.y, pa.z - pb.z);
    camera = {
      focus: { x: (pa.x + pb.x) / 2, y: (pa.y + pb.y) / 2, z: (pa.z + pb.z) / 2 },
      distance: span * 1.7 + 360,
      pitch: 0.58,
    };
  } else if (state.mode === 'cluster' && state.clusterId != null) {
    const cluster = graph.clusters.find(c => c.id === state.clusterId);
    const members = graph.nodes.filter(node => node.cluster === state.clusterId);
    graph.nodes.forEach((node, i) => {
      // 0.15 round-trips to 0.150000006 in float32 (dim is a Float32Array), breaking
      // the ≤0.15 contract — nudge just under it. Don't "simplify" back to 0.15.
      if (node.cluster !== state.clusterId) dim[i] = Math.min(dim[i]!, 0.1499999);
      else dim[i] = Math.max(dim[i]!, 1);
    });
    if (cluster && members.length > 0) {
      const focus = members.reduce((sum, node) => ({
        x: sum.x + node.x * spatialScale,
        y: sum.y + node.y * spatialScale,
        z: sum.z + node.z * spatialScale,
      }), { x: 0, y: 0, z: 0 });
      focus.x /= members.length; focus.y /= members.length; focus.z /= members.length;
      const radius = Math.max(...members.map(node => Math.hypot(
        node.x * spatialScale - focus.x,
        node.y * spatialScale - focus.y,
        node.z * spatialScale - focus.z,
      )));
      camera = { focus, distance: Math.min(1650, Math.max(1100, radius * 1.75)), pitch: 0.68 };
    }
  } else if (state.selectedId && buffers.index.has(state.selectedId)) {
    beams = edgesOf(graph, state.selectedId).slice(0, MAX_BEAMS);
    const lit = new Set([state.selectedId, ...beams.flatMap(e => [e.a, e.b])]);
    graph.nodes.forEach((node, i) => {
      if (lit.has(node.id)) dim[i] = 1;
      else dim[i] = Math.min(dim[i]!, 0.35);
    });
    camera = { focus: positionOf(buffers, state.selectedId), distance: 920, pitch: 0.62 };
  }

  return { position, dim, beams, camera };
}

// The phone camera shows a cropped slice of the graph, so a smaller resting
// web stays legible while retaining the strongest relationships.
export const AMBIENT_EDGE_CAP = { fine: 250, coarse: 48 } as const;

/** Strongest edges rendered at rest as the ambient connection layer. */
export function pickAmbientEdges(edges: UniverseEdge[], cap: number): UniverseEdge[] {
  return [...edges]
    .sort((a, b) => b.strength - a.strength || a.id.localeCompare(b.id))
    .slice(0, Math.max(0, cap));
}

export const SUN_RADIUS = 40;
export const RINGED_PLANETS = 5;

export type PlanetSpec = {
  id: string;
  radius: number;
  bandCount: number;
  bandPhase: number;
  axisTilt: number;
  spinSpeed: number;
  ringed: boolean;
  colorA: [number, number, number];
  colorB: [number, number, number];
};

/** Deterministic per-planet look, derived from community hue + id seeds. */
export function planetSpecs(graph: UniverseGraph): Map<string, PlanetSpec> {
  const clusterColor = new Map(graph.clusters.map(c => [c.id, hexToRgb(c.color)]));
  const planets = graph.nodes.filter(n => n.celestial === 'planet');
  const byInfluence = [...planets].sort((a, b) => b.influence - a.influence || a.id.localeCompare(b.id));
  const ringed = new Set(byInfluence.slice(0, RINGED_PLANETS).map(n => n.id));
  const specs = new Map<string, PlanetSpec>();
  for (const node of planets) {
    const base = clusterColor.get(node.cluster) ?? ([0.7, 0.75, 0.95] as [number, number, number]);
    const darken = 0.36 + stableUnit(`${node.id}:d`) * 0.18;
    specs.set(node.id, {
      id: node.id,
      radius: 13 + Math.min(1, Math.max(0, node.influence)) * 15,
      bandCount: 2 + Math.floor(stableUnit(`${node.id}:b`) * 3),
      bandPhase: stableUnit(`${node.id}:p`),
      axisTilt: stableUnit(`${node.id}:t`) * 0.5,
      spinSpeed: 0.05 + stableUnit(`${node.id}:s`) * 0.1,
      ringed: ringed.has(node.id),
      colorA: [base[0] * darken, base[1] * darken, base[2] * darken],
      colorB: mixToWhite(base, 0.42 + stableUnit(`${node.id}:l`) * 0.25),
    });
  }
  return specs;
}

/** Ambient connection layer intensity per scene state.
 * cluster: -1 = no cluster filter; otherwise only that cluster's internal
 * edges render at full strength (the rest drop to a floor in-shader). */
export function ambientLevel(state: SceneState): { amb: number; cluster: number } {
  if (state.mode === 'cluster' && state.clusterId != null) return { amb: 0.9, cluster: state.clusterId };
  if (state.mode === 'orbit' || state.mode === 'relationship') return { amb: 0.08, cluster: -1 };
  if (state.timeIndex >= 0) return { amb: 0.3, cluster: -1 };
  if (state.selectedId) return { amb: 0.22, cluster: -1 };
  return { amb: 1, cluster: -1 };
}
