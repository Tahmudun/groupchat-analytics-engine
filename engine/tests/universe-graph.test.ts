import { describe, expect, it } from 'vitest';
import { buildUniverseGraph, connectionTier } from '@/lib/universe/graph';
import type { UniverseSourceNode } from '@/lib/universe/types';

const node = (id: string, messages = 10): UniverseSourceNode => ({
  id, name: id.toUpperCase(), messages, recentMessages: 1, reactions: 1,
  weeklyScore: 10, firstActive: '2026-01-01T00:00:00.000Z',
  lastActive: '2026-07-01T00:00:00.000Z', history: [10, 20],
});

describe('universe graph shaping', () => {
  const nodes = [node('a', 100), node('b', 80), node('c', 60), node('d', 20), node('e', 5)];
  const edges = [
    { a: 'a', b: 'b', interactions: 90 }, { a: 'a', b: 'c', interactions: 50 },
    { a: 'c', b: 'd', interactions: 20 }, { a: 'd', b: 'e', interactions: 5 },
  ];

  it('is deterministic and covers every valid node exactly once', () => {
    const first = buildUniverseGraph(nodes, edges, ['2026-01', '2026-02']);
    const second = buildUniverseGraph(nodes, edges, ['2026-01', '2026-02']);
    expect(first.nodes.map(n => [n.id, n.cluster, n.x, n.y])).toEqual(second.nodes.map(n => [n.id, n.cluster, n.x, n.y]));
    expect(new Set(first.nodes.map(n => n.id))).toEqual(new Set(['a', 'b', 'c', 'd', 'e']));
    expect(first.nodes.every(n => Number.isFinite(n.x) && Number.isFinite(n.y) && Number.isFinite(n.z))).toBe(true);
    expect(first.nodes.filter(n => n.celestial === 'sun')).toHaveLength(1);
    expect(first.nodes.every(n => n.influence >= 0 && n.influence <= 1)).toBe(true);
  });

  it('drops invalid edges and keeps strengths bounded', () => {
    const graph = buildUniverseGraph(nodes, [...edges, { a: 'a', b: 'missing', interactions: 99 }, { a: 'a', b: 'a', interactions: 5 }], []);
    expect(graph.edges).toHaveLength(edges.length);
    expect(graph.edges.every(edge => edge.strength >= 0 && edge.strength <= 1)).toBe(true);
  });

  it('uses clear deterministic connection tiers', () => {
    expect(connectionTier(0.9)).toBe('Core connection');
    expect(connectionTier(0.5)).toBe('Frequent co-stars');
    expect(connectionTier(0.1)).toBe('Recurring orbit');
  });

  it('does not collapse a large connected chat into one visual cluster', () => {
    const largeNodes = Array.from({ length: 560 }, (_, index) => node(`member-${index}`, 1000 - index));
    const connected = largeNodes.flatMap((item, index) => [
      { a: item.id, b: largeNodes[(index + 1) % largeNodes.length]!.id, interactions: 30 },
      ...(index > 0 ? [{ a: 'member-0', b: item.id, interactions: 12 + (index % 9) }] : []),
    ]);
    const graph = buildUniverseGraph(largeNodes, connected, []);
    expect(graph.clusters).toHaveLength(7);
    expect(Math.max(...graph.clusters.map(cluster => cluster.members))).toBeLessThan(largeNodes.length / 2);
  });

  it('pins the sun at the galaxy origin', () => {
    const graph = buildUniverseGraph(nodes, edges, []);
    const sun = graph.nodes.find(n => n.celestial === 'sun')!;
    expect(sun.x).toBe(0);
    expect(sun.y).toBe(0);
    expect(sun.z).toBe(0);
  });

  it('places higher-influence members closer to the core', () => {
    const graph = buildUniverseGraph(nodes, edges, []);
    const byInfluence = [...graph.nodes].sort((a, b) => b.influence - a.influence);
    const radius = (n: (typeof byInfluence)[number]) => Math.hypot(n.x, n.z);
    for (let i = 1; i < byInfluence.length - 1; i++) {
      expect(radius(byInfluence[i]!)).toBeLessThanOrEqual(radius(byInfluence[i + 1]!) + 0.001);
    }
  });

  it('sets cluster coordinates to the centroid of member positions', () => {
    const graph = buildUniverseGraph(nodes, edges, []);
    for (const cluster of graph.clusters) {
      const members = graph.nodes.filter(n => n.cluster === cluster.id);
      const mean = (pick: (n: (typeof members)[number]) => number) =>
        members.reduce((sum, n) => sum + pick(n), 0) / Math.max(1, members.length);
      expect(cluster.x).toBeCloseTo(mean(n => n.x), 6);
      expect(cluster.y).toBeCloseTo(mean(n => n.y), 6);
      expect(cluster.z).toBeCloseTo(mean(n => n.z), 6);
    }
  });
});
