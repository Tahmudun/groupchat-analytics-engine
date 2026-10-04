import { describe, expect, it } from 'vitest';
import {
  ZODIAC, ZODIAC_SIGNS, astrologyReading, isZodiacSign, wholeSignRelationship,
} from '@/lib/universe/astrology';
import {
  buildMemberInsight, communityInsights, memberOrbit, roleInsight,
} from '@/lib/universe/insights';
import type { UniverseCluster, UniverseEdge, UniverseGraph, UniverseNode } from '@/lib/universe/types';

const COLORS = ['#a78bfa', '#22d3ee', '#fbbf24', '#fb7185', '#34d399', '#818cf8', '#e879f9'];
const node = (id: string, cluster: number, over: Partial<UniverseNode> = {}): UniverseNode => ({
  id, name: id.toUpperCase(), messages: 1000 - cluster * 30, recentMessages: 10 + cluster,
  reactions: 4 + cluster, weeklyScore: 20 + cluster, firstActive: `202${cluster % 3}-01-01T00:00:00.000Z`,
  lastActive: '2026-07-01T00:00:00.000Z', history: [1, 2], prominence: 0.9 - cluster * 0.08,
  influence: 0.9 - cluster * 0.07, celestial: id === 'n0a' ? 'sun' : cluster < 3 ? 'planet' : 'star',
  cluster, role: id === 'n0a' ? 'Center of Gravity' : 'Constellation Regular', connections: 0,
  interactionTotal: 0, x: cluster * 100, y: 0, z: cluster * -80, ...over,
});
const edge = (a: string, b: string, interactions: number): UniverseEdge => ({
  a, b, interactions, id: `${a}\0${b}`, strength: Math.min(1, interactions / 100),
  tier: interactions >= 72 ? 'Core connection' : interactions >= 36 ? 'Frequent co-stars' : 'Recurring orbit',
});

function fixture(): UniverseGraph {
  const clusters: UniverseCluster[] = Array.from({ length: 7 }, (_, id) => ({
    id, name: `Region ${id}`, color: COLORS[id]!, x: id * 100, y: 0, z: id * -80,
    members: 2, centralMember: `n${id}a`,
  }));
  const nodes = clusters.flatMap(cluster => [node(`n${cluster.id}a`, cluster.id), node(`n${cluster.id}b`, cluster.id, { prominence: cluster.id === 6 ? 0.05 : 0.5 })]);
  const edges: UniverseEdge[] = [];
  for (let cluster = 0; cluster < 7; cluster++) {
    edges.push(edge(`n${cluster}a`, `n${cluster}b`, 20 + cluster * 14));
    edges.push(edge(`n${cluster}a`, `n${(cluster + 1) % 7}a`, 90 - cluster * 8));
  }
  const degree = new Map<string, { count: number; total: number }>();
  for (const item of edges) for (const id of [item.a, item.b]) {
    const value = degree.get(id) ?? { count: 0, total: 0 };
    value.count++; value.total += item.interactions; degree.set(id, value);
  }
  for (const member of nodes) {
    const value = degree.get(member.id) ?? { count: 0, total: 0 };
    member.connections = value.count; member.interactionTotal = value.total;
  }
  nodes[0]!.role = 'Center of Gravity';
  nodes[1]!.role = 'Bridge Signal';
  return {
    generatedAt: '2026-07-14T00:00:00.000Z', timeline: ['2026-06', '2026-07'], nodes, edges, clusters,
    stats: { members: nodes.length, connections: edges.length, interactions: edges.reduce((sum, item) => sum + item.interactions, 0) },
  };
}

describe('communityInsights', () => {
  it('assigns every region a distinct, evidence-backed behavioral archetype', () => {
    const graph = fixture();
    const insights = communityInsights(graph);
    expect(insights.size).toBe(7);
    expect(new Set([...insights.values()].map(item => item.archetype)).size).toBe(7);
    for (const insight of insights.values()) {
      expect(insight.summary.length).toBeGreaterThan(20);
      expect(insight.evidence.length).toBeGreaterThanOrEqual(2);
      expect(insight.cohesionPercent + insight.crossPercent).toBe(100);
      expect(insight.notableMembers.length).toBeGreaterThan(0);
    }
  });
});

describe('member reports', () => {
  it('explains role evidence and returns a strongest-first orbit', () => {
    const graph = fixture();
    const member = graph.nodes[0]!;
    const role = roleInsight(graph, member);
    expect(role.title).toBe('Center of Gravity');
    expect(role.summary).toContain('center');
    expect(role.evidence.join(' ')).toContain(member.interactionTotal.toLocaleString('en-US'));
    const orbit = memberOrbit(graph, member.id);
    expect(orbit.length).toBeGreaterThan(0);
    for (let i = 1; i < orbit.length; i++) expect(orbit[i - 1]!.edge.interactions).toBeGreaterThanOrEqual(orbit[i]!.edge.interactions);
    const report = buildMemberInsight(graph, member.id);
    expect(report?.community.name).toBe(graph.clusters[member.cluster]!.name);
    expect(report?.orbit).toEqual(orbit);
  });
});

describe('astrologyReading', () => {
  it('contains all twelve traditional signs and validates ids', () => {
    expect(ZODIAC_SIGNS).toHaveLength(12);
    expect(new Set(ZODIAC_SIGNS.map(sign => ZODIAC[sign].name)).size).toBe(12);
    expect(isZodiacSign('scorpio')).toBe(true);
    expect(isZodiacSign('ophiuchus')).toBe(false);
    for (const sign of ZODIAC_SIGNS) {
      expect(ZODIAC[sign].element).toMatch(/Fire|Earth|Air|Water/);
      expect(ZODIAC[sign].traditionalRuler.length).toBeGreaterThan(2);
    }
  });

  it('uses traditional rulers and correct whole-sign relationships', () => {
    expect(ZODIAC.scorpio.traditionalRuler).toBe('Mars');
    expect(ZODIAC.aquarius.traditionalRuler).toBe('Saturn');
    expect(ZODIAC.pisces.traditionalRuler).toBe('Jupiter');
    expect(wholeSignRelationship('leo', 'scorpio').name).toBe('Square');
    expect(wholeSignRelationship('aries', 'libra').name).toBe('Opposition');
    expect(wholeSignRelationship('taurus', 'virgo').name).toBe('Trine');
    expect(wholeSignRelationship('gemini', 'leo').name).toBe('Sextile');
  });

  it('synthesizes Sun, Rising, graph role, and community without replacing measured data', () => {
    const insight = buildMemberInsight(fixture(), 'n0a')!;
    const reading = astrologyReading(insight, 'leo', 'scorpio');
    expect(reading.sun?.body).toContain('Leo');
    expect(reading.rising?.ruler).toContain('Mars');
    expect(reading.synthesis?.title).toContain('Leo');
    expect(reading.synthesis?.title).toContain('Scorpio');
    expect(reading.synthesis?.community).toContain(insight.role.title === 'Center of Gravity' ? 'attention returns' : insight.role.title);
    expect(reading.synthesis?.community).toContain(insight.community.archetype);
    expect(reading.synthesis?.dynamic).toContain('same tempo');
    expect(reading.synthesis?.forecast.length).toBeGreaterThan(180);
  });

  it('produces a complete, materially specific reading for all 144 combinations', () => {
    const insight = buildMemberInsight(fixture(), 'n0a')!;
    const signatures = new Set<string>();
    for (const sun of ZODIAC_SIGNS) for (const rising of ZODIAC_SIGNS) {
      const reading = astrologyReading(insight, sun, rising);
      expect(reading.sun?.body.length).toBeGreaterThan(120);
      expect(reading.rising?.body.length).toBeGreaterThan(70);
      expect(reading.synthesis?.tags).toHaveLength(4);
      expect(reading.synthesis?.dynamic.length).toBeGreaterThan(250);
      expect(reading.synthesis?.community).toContain(insight.community.name);
      expect(reading.synthesis?.pressure).toContain(ZODIAC[sun].name);
      expect(reading.synthesis?.pressure).toContain(ZODIAC[rising].name);
      expect(reading.synthesis?.growth.length).toBeGreaterThan(180);
      expect(reading.synthesis?.forecast.length).toBeGreaterThan(180);
      signatures.add(`${reading.synthesis?.title}|${reading.synthesis?.dynamic}|${reading.synthesis?.growth}`);
    }
    expect(signatures.size).toBe(144);
  });
});
