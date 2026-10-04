import { describe, expect, it } from 'vitest';
import { buildUniverseGraph } from '@/lib/universe/graph';
import type { UniverseSourceNode } from '@/lib/universe/types';
import {
  AMBIENT_EDGE_CAP, RINGED_PLANETS, SUN_RADIUS, ambientLevel,
  buildStarBuffers, computeTargets, historyMaxima, pickAmbientEdges,
  planetSpecs, starSize, timeFactor, type SceneState,
} from '@/app/(site)/universe/scene/starAttributes';

const node = (id: string, messages: number): UniverseSourceNode => ({
  id, name: id.toUpperCase(), messages, recentMessages: 2, reactions: 3,
  weeklyScore: messages, firstActive: '2026-01-01T00:00:00.000Z',
  lastActive: '2026-07-01T00:00:00.000Z', history: [messages / 2, messages],
});

const nodes = Array.from({ length: 30 }, (_, i) => node(`m${i}`, 500 - i * 12));
const edges = nodes.slice(1).map((n, i) => ({ a: 'm0', b: n.id, interactions: 200 - i * 5 }));
const graph = buildUniverseGraph(nodes, edges, ['2026-01', '2026-02']);
const buffers = buildStarBuffers(graph);
const maxima = historyMaxima(graph);

const state = (over: Partial<Parameters<typeof computeTargets>[2]> = {}) => ({
  mode: 'overview' as const, selectedId: null, orbitRoot: null,
  clusterId: null, relationship: null, timeIndex: -1, ...over,
});

describe('buildStarBuffers', () => {
  it('packs one entry per node with finite values', () => {
    expect(buffers.ids.length).toBe(graph.nodes.length);
    expect(buffers.position.length).toBe(graph.nodes.length * 3);
    expect(buffers.color.length).toBe(graph.nodes.length * 3);
    expect([...buffers.position].every(Number.isFinite)).toBe(true);
    expect([...buffers.size].every(v => v >= 0 && Number.isFinite(v))).toBe(true);
  });

  it('keeps mesh-rendered worlds out of the member point layer', () => {
    const planet = graph.nodes.find(n => n.celestial === 'planet')!;
    const star = graph.nodes.find(n => n.celestial === 'star')!;
    expect(buffers.size[buffers.index.get(planet.id)!]!).toBe(0);
    expect(buffers.size[buffers.index.get(star.id)!]!).toBeGreaterThan(0);
  });
});

describe('computeTargets', () => {
  it('overview without selection: everyone fully lit, no beams, camera at origin', () => {
    const targets = computeTargets(graph, buffers, state(), maxima);
    expect([...targets.dim].every(v => v === 1)).toBe(true);
    expect(targets.beams).toEqual([]);
    expect(targets.camera.focus).toEqual({ x: 0, y: 0, z: 0 });
  });

  it('overview selection dims non-neighbors and ignites up to 12 beams', () => {
    const targets = computeTargets(graph, buffers, state({ selectedId: 'm0' }), maxima);
    expect(targets.beams.length).toBeLessThanOrEqual(12);
    expect(targets.beams.every(e => e.a === 'm0' || e.b === 'm0')).toBe(true);
    const beamIds = new Set(targets.beams.flatMap(e => [e.a, e.b]));
    for (const id of buffers.ids) {
      const dim = targets.dim[buffers.index.get(id)!]!;
      if (beamIds.has(id)) expect(dim).toBe(1);
      else expect(dim).toBeLessThan(0.5);
    }
    // beams are the strongest edges first
    for (let i = 1; i < targets.beams.length; i++) {
      expect(targets.beams[i - 1]!.interactions).toBeGreaterThanOrEqual(targets.beams[i]!.interactions);
    }
  });

  it('orbit mode repositions ring members around the root and dims the rest', () => {
    const targets = computeTargets(graph, buffers, state({ mode: 'orbit', orbitRoot: 'm0', selectedId: 'm0' }), maxima);
    const rootIdx = buffers.index.get('m0')!;
    const rootPos = {
      x: targets.position[rootIdx * 3]!,
      y: targets.position[rootIdx * 3 + 1]!,
      z: targets.position[rootIdx * 3 + 2]!,
    };
    // root stays on its galaxy position
    expect(rootPos.x).toBeCloseTo(buffers.position[rootIdx * 3]!, 6);
    // ring members = top-24 neighbors by interactions (ORBIT_MAX); beams cap at 12 separately
    const rootEdges = graph.edges
      .filter(e => e.a === 'm0' || e.b === 'm0')
      .sort((a, b) => b.interactions - a.interactions);
    const ringIds = new Set(rootEdges.map(e => (e.a === 'm0' ? e.b : e.a)).slice(0, 24));
    let moved = 0;
    for (const id of buffers.ids) {
      const i = buffers.index.get(id)!;
      const d = Math.hypot(
        targets.position[i * 3]! - buffers.position[i * 3]!,
        targets.position[i * 3 + 1]! - buffers.position[i * 3 + 1]!,
        targets.position[i * 3 + 2]! - buffers.position[i * 3 + 2]!,
      );
      if (id !== 'm0' && ringIds.has(id)) {
        if (d > 0.001) moved++;
        const toRoot = Math.hypot(
          targets.position[i * 3]! - rootPos.x,
          targets.position[i * 3 + 1]! - rootPos.y,
          targets.position[i * 3 + 2]! - rootPos.z,
        );
        expect(toRoot).toBeLessThanOrEqual(380);
      } else if (id !== 'm0') {
        expect(d).toBeLessThan(0.001);
        expect(targets.dim[i]!).toBeLessThanOrEqual(0.1);
      }
    }
    expect(moved).toBeGreaterThan(0);
    expect(targets.camera.focus.x).toBeCloseTo(rootPos.x, 6);
  });

  it('widens orbit spacing and cluster framing by the requested spatial scale', () => {
    const scene = state({ mode: 'orbit', orbitRoot: 'm0', selectedId: 'm0' });
    const normal = computeTargets(graph, buffers, scene, maxima);
    const wide = computeTargets(graph, buffers, scene, maxima, 1.38);
    const root = buffers.index.get('m0')!;
    const firstEdge = graph.edges
      .filter(edge => edge.a === 'm0' || edge.b === 'm0')
      .sort((a, b) => b.interactions - a.interactions)[0]!;
    const neighborId = firstEdge.a === 'm0' ? firstEdge.b : firstEdge.a;
    const neighbor = buffers.index.get(neighborId)!;
    const distance = (targets: typeof normal) => Math.hypot(
      targets.position[neighbor * 3]! - targets.position[root * 3]!,
      targets.position[neighbor * 3 + 1]! - targets.position[root * 3 + 1]!,
      targets.position[neighbor * 3 + 2]! - targets.position[root * 3 + 2]!,
    );
    expect(distance(wide) / distance(normal)).toBeCloseTo(1.38, 5);

    const cluster = graph.clusters[0]!;
    const normalCluster = computeTargets(graph, buffers, state({ mode: 'cluster', clusterId: cluster.id }), maxima);
    const wideCluster = computeTargets(graph, buffers, state({ mode: 'cluster', clusterId: cluster.id }), maxima, 1.38);
    expect(wideCluster.camera.focus.x).toBeCloseTo(normalCluster.camera.focus.x * 1.38, 5);
    expect(wideCluster.camera.focus.z).toBeCloseTo(normalCluster.camera.focus.z * 1.38, 5);
  });

  it('relationship mode isolates the pair with one beam', () => {
    const edge = graph.edges[0]!;
    const targets = computeTargets(graph, buffers, state({ mode: 'relationship', relationship: edge, selectedId: edge.b }), maxima);
    expect(targets.beams).toEqual([edge]);
    for (const id of buffers.ids) {
      const dim = targets.dim[buffers.index.get(id)!]!;
      if (id === edge.a || id === edge.b) expect(dim).toBe(1);
      else expect(dim).toBeLessThanOrEqual(0.06);
    }
  });

  it('cluster mode lights only that community', () => {
    const cluster = graph.clusters[0]!;
    const targets = computeTargets(graph, buffers, state({ mode: 'cluster', clusterId: cluster.id }), maxima);
    for (const node of graph.nodes) {
      const dim = targets.dim[buffers.index.get(node.id)!]!;
      if (node.cluster === cluster.id) expect(dim).toBe(1);
      else expect(dim).toBeLessThanOrEqual(0.15);
    }
    expect(targets.camera.focus.x).toBeCloseTo(cluster.x, 6);
  });

  it('time scrub multiplies dim by the month factor', () => {
    const targets = computeTargets(graph, buffers, state({ timeIndex: 0 }), maxima);
    for (const node of graph.nodes) {
      expect(targets.dim[buffers.index.get(node.id)!]!)
        .toBeCloseTo(timeFactor(node, 0, maxima), 6);
    }
  });
});

describe('timeFactor', () => {
  it('is bounded and floors silent months', () => {
    const silent = { ...graph.nodes[0]!, history: [0, 0] };
    expect(timeFactor(silent, 0, maxima)).toBe(0.08);
    for (const n of graph.nodes) {
      const f = timeFactor(n, 1, maxima);
      expect(f).toBeGreaterThanOrEqual(0.08);
      expect(f).toBeLessThanOrEqual(1.2);
    }
    expect(timeFactor(graph.nodes[0]!, -1, maxima)).toBe(1);
  });
});

describe('starSize (planetary rework)', () => {
  it('renders sun and planets at size 0 on the points layers (they are meshes now)', () => {
    expect(starSize({ celestial: 'sun', prominence: 1, influence: 1 } as never)).toBe(0);
    expect(starSize({ celestial: 'planet', prominence: 1, influence: 1 } as never)).toBe(0);
  });
  it('gives stars a 10..30 size range by prominence', () => {
    expect(starSize({ celestial: 'star', prominence: 0, influence: 0 } as never)).toBe(10);
    expect(starSize({ celestial: 'star', prominence: 1, influence: 0 } as never)).toBe(30);
  });
});

describe('pickAmbientEdges', () => {
  const edge = (id: string, strength: number) =>
    ({ id, a: `${id}-a`, b: `${id}-b`, strength, interactions: 1, tier: 'Recurring orbit' }) as never;
  it('takes the strongest edges up to the cap, deterministically', () => {
    const edges = [edge('c', 0.2), edge('a', 0.9), edge('b', 0.9), edge('d', 0.5)];
    const picked = pickAmbientEdges(edges, 3);
    expect(picked.map(e => (e as { id: string }).id)).toEqual(['a', 'b', 'd']);
  });
  it('caps are 250 fine / 48 coarse', () => {
    expect(AMBIENT_EDGE_CAP.fine).toBe(250);
    expect(AMBIENT_EDGE_CAP.coarse).toBe(48);
  });
});

describe('planetSpecs', () => {
  // Build a tiny graph: 1 sun, 7 planets, 2 stars, 2 clusters.
  const tinyGraph = {
    clusters: [
      { id: 0, name: 'A', color: '#7f5af0', x: 0, y: 0, z: 0, memberCount: 5 },
      { id: 1, name: 'B', color: '#2cb67d', x: 0, y: 0, z: 0, memberCount: 5 },
    ],
    nodes: [
      { id: 'sun', celestial: 'sun', cluster: 0, influence: 1, prominence: 1 },
      ...Array.from({ length: 7 }, (_, i) => ({
        id: `pl${i}`, celestial: 'planet', cluster: i % 2, influence: 1 - i * 0.1, prominence: 0.8,
      })),
      { id: 's1', celestial: 'star', cluster: 0, influence: 0.1, prominence: 0.2 },
      { id: 's2', celestial: 'star', cluster: 1, influence: 0.1, prominence: 0.2 },
    ],
    edges: [], timeline: [],
  } as never;

  it('covers exactly the planets', () => {
    const specs = planetSpecs(tinyGraph);
    expect(specs.size).toBe(7);
    expect(specs.has('sun')).toBe(false);
    expect(specs.has('s1')).toBe(false);
  });
  it('rings exactly the top RINGED_PLANETS by influence', () => {
    const specs = planetSpecs(tinyGraph);
    const ringed = [...specs.values()].filter(s => s.ringed).map(s => s.id).sort();
    expect(ringed).toEqual(['pl0', 'pl1', 'pl2', 'pl3', 'pl4']);
    expect(RINGED_PLANETS).toBe(5);
  });
  it('keeps the tuned radius within 13..28 and colors within 0..1, deterministically', () => {
    const a = planetSpecs(tinyGraph);
    const b = planetSpecs(tinyGraph);
    for (const [id, spec] of a) {
      expect(spec.radius).toBeGreaterThanOrEqual(13);
      expect(spec.radius).toBeLessThanOrEqual(28);
      for (const c of [...spec.colorA, ...spec.colorB]) {
        expect(c).toBeGreaterThanOrEqual(0);
        expect(c).toBeLessThanOrEqual(1);
      }
      expect(b.get(id)).toEqual(spec);
    }
    expect(SUN_RADIUS).toBe(40);
  });
});

describe('ambientLevel', () => {
  const base: SceneState = { mode: 'overview', selectedId: null, orbitRoot: null, clusterId: null, relationship: null, timeIndex: -1 };
  it('full at rest, spotlights the cluster in cluster mode, fades for orbit/relationship', () => {
    expect(ambientLevel(base)).toEqual({ amb: 1, cluster: -1 });
    expect(ambientLevel({ ...base, mode: 'cluster', clusterId: 3 })).toEqual({ amb: 0.9, cluster: 3 });
    expect(ambientLevel({ ...base, mode: 'orbit', orbitRoot: 'x' }).amb).toBeLessThan(0.15);
    expect(ambientLevel({ ...base, mode: 'relationship' }).amb).toBeLessThan(0.15);
    expect(ambientLevel({ ...base, timeIndex: 2 }).amb).toBeLessThan(0.5);
    expect(ambientLevel({ ...base, selectedId: 'x' }).amb).toBeLessThan(0.3);
  });
});
