import { describe, expect, it } from 'vitest';
import { buildUniverseGraph } from '@/lib/universe/graph';
import type { UniverseSourceNode } from '@/lib/universe/types';
import { chooseLabels, pickStar, type ProjectedStar } from '@/app/(site)/universe/scene/labels';

const node = (id: string, messages: number): UniverseSourceNode => ({
  id, name: `Name ${id}`, messages, recentMessages: 1, reactions: 1,
  weeklyScore: messages, firstActive: '2026-01-01T00:00:00.000Z',
  lastActive: '2026-07-01T00:00:00.000Z', history: [messages],
});
const nodes = Array.from({ length: 40 }, (_, i) => node(`m${i}`, 400 - i * 9));
const edges = nodes.slice(1, 10).map((n, i) => ({ a: 'm0', b: n.id, interactions: 100 - i }));
const graph = buildUniverseGraph(nodes, edges, ['2026-01']);

const overview = { mode: 'overview' as const, selectedId: null, orbitRoot: null, clusterId: null, relationship: null, timeIndex: -1 };
const measure = (text: string) => text.length * 7;

function projectAll(spacingX = 60): Map<string, ProjectedStar> {
  return new Map(graph.nodes.map((n, i) => [n.id, {
    id: n.id, x: 100 + (i % 8) * spacingX, y: 80 + Math.floor(i / 8) * 70,
    depth: 0.5, radius: 6, alpha: 1,
  }]));
}

describe('chooseLabels', () => {
  it('labels the selected member even when crowded, and never overlaps', () => {
    const projected = projectAll(8); // extremely crowded
    const placed = chooseLabels(graph, { ...overview, selectedId: 'm39' }, projected, { width: 900, height: 700, coarse: false }, measure);
    expect(placed.some(l => l.id === 'm39')).toBe(true);
    for (let i = 0; i < placed.length; i++) {
      for (let j = i + 1; j < placed.length; j++) {
        const a = placed[i]!; const b = placed[j]!;
        const overlapX = Math.abs(a.x - b.x) < (measure(a.text) + measure(b.text)) / 2 + 8;
        const overlapY = Math.abs(a.y - b.y) < 18;
        expect(overlapX && overlapY).toBe(false);
      }
    }
  });

  it('skips offscreen and fully dimmed stars', () => {
    const projected = projectAll();
    projected.set('m1', { ...projected.get('m1')!, x: -500 });
    projected.set('m2', { ...projected.get('m2')!, alpha: 0.02 });
    const placed = chooseLabels(graph, overview, projected, { width: 900, height: 700, coarse: false }, measure);
    expect(placed.some(l => l.id === 'm1')).toBe(false);
    expect(placed.some(l => l.id === 'm2')).toBe(false);
  });

  it('keeps every desktop world while capping optional star labels tighter on coarse pointers', () => {
    const projected = projectAll(120);
    const desktop = chooseLabels(graph, overview, projected, { width: 1400, height: 900, coarse: false }, measure);
    const phone = chooseLabels(graph, overview, projected, { width: 390, height: 844, coarse: true }, measure);
    const worlds = new Set(graph.nodes.filter(n => n.celestial !== 'star').map(n => n.id));
    expect(phone.filter(label => !worlds.has(label.id)).length).toBeLessThanOrEqual(8);
    expect(desktop.filter(label => !worlds.has(label.id)).length).toBeLessThanOrEqual(12);
    expect(desktop.length).toBeGreaterThanOrEqual(phone.length);
  });

  it('caps world callouts on coarse portrait views while keeping the selected world', () => {
    const projected = projectAll(60);
    const selectedWorld = graph.nodes.find(node => node.celestial !== 'star')!;
    const placed = chooseLabels(
      graph,
      { ...overview, selectedId: selectedWorld.id },
      projected,
      { width: 390, height: 844, coarse: true },
      measure,
    );
    const worlds = new Set(graph.nodes.filter(node => node.celestial !== 'star').map(node => node.id));
    const worldLabels = placed.filter(label => worlds.has(label.id));
    expect(worldLabels.length).toBeLessThanOrEqual(5);
    expect(worldLabels.some(label => label.id === selectedWorld.id)).toBe(true);
  });

  it('only labels the orbit root and its edge-neighbors in orbit mode', () => {
    const projected = projectAll(60);
    const state = { ...overview, mode: 'orbit' as const, orbitRoot: 'm0', selectedId: 'm0' };
    const placed = chooseLabels(graph, state, projected, { width: 900, height: 700, coarse: false }, measure);
    const neighborIds = new Set(graph.edges
      .filter(e => e.a === 'm0' || e.b === 'm0')
      .map(e => (e.a === 'm0' ? e.b : e.a)));
    expect(placed.some(l => l.id === 'm0')).toBe(true);
    for (const label of placed) {
      expect(label.id === 'm0' || neighborIds.has(label.id)).toBe(true);
    }
  });

  it('nudges two emphasized relationship labels apart instead of overlapping', () => {
    const projected = projectAll(60);
    // Place a and b just 6px apart on screen — their labels would collide if placed directly below each other.
    const a = projected.get('m5')!;
    projected.set('m6', { ...projected.get('m6')!, x: a.x + 6, y: a.y });
    const state = {
      ...overview,
      relationship: { a: 'm5', b: 'm6', interactions: 10, id: 'm5-m6', strength: 0.5, tier: 'Core connection' as const },
    };
    const placed = chooseLabels(graph, state, projected, { width: 900, height: 700, coarse: false }, measure);
    const labelA = placed.find(l => l.id === 'm5');
    const labelB = placed.find(l => l.id === 'm6');
    expect(labelA).toBeTruthy();
    expect(labelB).toBeTruthy();
    const overlapX = Math.abs(labelA!.x - labelB!.x) < (measure(labelA!.text) + measure(labelB!.text)) / 2 + 8;
    const overlapY = Math.abs(labelA!.y - labelB!.y) < 18;
    expect(overlapX && overlapY).toBe(false);
  });
});

describe('pickStar', () => {
  const projected: ProjectedStar[] = [
    { id: 'near', x: 100, y: 100, depth: 0.2, radius: 10, alpha: 1 },
    { id: 'far', x: 108, y: 100, depth: 0.8, radius: 10, alpha: 1 },
    { id: 'dimmed', x: 300, y: 300, depth: 0.2, radius: 10, alpha: 0.03 },
  ];
  it('picks the closest hit and ignores dimmed stars', () => {
    expect(pickStar(101, 101, projected)).toBe('near');
    expect(pickStar(300, 300, projected)).toBeNull();
    expect(pickStar(600, 600, projected)).toBeNull();
  });
});

describe('chooseLabels (planetary rework)', () => {
  const measure = (text: string) => text.length * 7;
  const view = { width: 1280, height: 900, coarse: false };
  const baseState = { mode: 'overview', selectedId: null, orbitRoot: null, clusterId: null, relationship: null, timeIndex: -1 } as never;

  const node = (id: string, celestial: string, influence: number) =>
    ({ id, name: id, celestial, influence, cluster: 0, role: 'Constellation Regular' }) as never;
  const proj = (id: string, x: number, y: number, radius: number, alpha = 1) =>
    [id, { id, x, y, depth: 0.5, radius, alpha }] as const;

  it('always labels every visible world, with zero overlapping boxes and nudged flags', () => {
    // Two planets projected nearly on top of each other must both get labels.
    const graph = { nodes: [node('sun', 'sun', 1), node('p1', 'planet', 0.9), node('p2', 'planet', 0.8)], edges: [], clusters: [] } as never;
    const projected = new Map([proj('sun', 640, 450, 30), proj('p1', 640, 470, 20), proj('p2', 645, 468, 20)]);
    const placed = chooseLabels(graph, baseState, projected, view, measure);
    expect(placed.map(l => l.id).sort()).toEqual(['p1', 'p2', 'sun']);
    for (let i = 0; i < placed.length; i++) {
      for (let j = i + 1; j < placed.length; j++) {
        const a = placed[i]!;
        const b = placed[j]!;
        const aw = measure(a.text) / 2 + 5;
        const bw = measure(b.text) / 2 + 5;
        const overlap = Math.abs(a.x - b.x) < aw + bw && Math.abs(a.y - b.y) < 18;
        expect(overlap).toBe(false);
      }
    }
    expect(placed.some(l => l.nudged)).toBe(true);
    for (const l of placed) {
      expect(l.anchorX).toBeDefined();
      expect(l.anchorY).toBeDefined();
    }
  });

  it('does not label ordinary stars at overview distance', () => {
    const graph = { nodes: [node('s1', 'star', 0.3)], edges: [], clusters: [] } as never;
    const projected = new Map([proj('s1', 400, 400, 3)]);
    expect(chooseLabels(graph, baseState, projected, view, measure)).toEqual([]);
  });

  it('labels a star when zoomed close (large projected footprint)', () => {
    const graph = { nodes: [node('s1', 'star', 0.3)], edges: [], clusters: [] } as never;
    const projected = new Map([proj('s1', 400, 400, 8)]);
    const placed = chooseLabels(graph, baseState, projected, view, measure);
    expect(placed.map(l => l.id)).toEqual(['s1']);
  });

  it('labels a hovered star regardless of footprint', () => {
    const graph = { nodes: [node('s1', 'star', 0.3)], edges: [], clusters: [] } as never;
    const projected = new Map([proj('s1', 400, 400, 3)]);
    const placed = chooseLabels(graph, baseState, projected, { ...view, hoveredId: 's1' }, measure);
    expect(placed.map(l => l.id)).toEqual(['s1']);
  });

  it('caps proximity star labels', () => {
    const nodes = Array.from({ length: 30 }, (_, i) => node(`s${i}`, 'star', 0.3));
    const graph = { nodes, edges: [], clusters: [] } as never;
    const projected = new Map(nodes.map((n: { id: string }, i: number) =>
      proj(n.id, 100 + (i % 6) * 180, 100 + Math.floor(i / 6) * 140, 8)));
    const placed = chooseLabels(graph, baseState, projected, view, measure);
    expect(placed.length).toBeLessThanOrEqual(16);
  });
});
