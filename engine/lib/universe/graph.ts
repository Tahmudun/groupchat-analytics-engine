import { computeGalaxyLayout, spreadPlanets } from './layout';
import type {
  UniverseCluster, UniverseEdge, UniverseGraph, UniverseNode,
  UniverseSourceEdge, UniverseSourceNode,
} from './types';

const CLUSTERS = [
  ['Violet Assembly', '#a78bfa'],
  ['Cyan Circuit', '#22d3ee'],
  ['Solar Drift', '#fbbf24'],
  ['Crimson Orbit', '#fb7185'],
  ['Aurora Ring', '#34d399'],
  ['Midnight Relay', '#818cf8'],
  ['Magenta Array', '#e879f9'],
] as const;

function hash(value: string): number {
  let out = 2166136261;
  for (let i = 0; i < value.length; i++) {
    out ^= value.charCodeAt(i);
    out = Math.imul(out, 16777619);
  }
  return out >>> 0;
}

const bounded = (value: unknown) => Number.isFinite(Number(value)) ? Math.max(0, Number(value)) : 0;

function normalizedLogs(values: number[]): number[] {
  if (values.length === 0) return [];
  const logs = values.map(value => Math.log1p(bounded(value)));
  const min = Math.min(...logs);
  const max = Math.max(...logs);
  if (max === min) return logs.map(() => 0.5);
  return logs.map(value => (value - min) / (max - min));
}

export function connectionTier(strength: number): UniverseEdge['tier'] {
  if (strength >= 0.72) return 'Core connection';
  if (strength >= 0.36) return 'Frequent co-stars';
  return 'Recurring orbit';
}

/** Pure deterministic graph shaping. The same source rows always produce the
 * same clusters and coordinates, so members never find themselves in a newly
 * shuffled universe after a refresh. */
export function buildUniverseGraph(
  sourceNodes: UniverseSourceNode[],
  sourceEdges: UniverseSourceEdge[],
  timeline: string[],
): UniverseGraph {
  const uniqueNodes = [...new Map(sourceNodes.map(node => [node.id, node])).values()]
    .filter(node => node.id && node.name)
    .sort((a, b) => b.messages - a.messages || a.id.localeCompare(b.id));
  const ids = new Set(uniqueNodes.map(node => node.id));
  const cleanEdges = sourceEdges
    .filter(edge => edge.a !== edge.b && ids.has(edge.a) && ids.has(edge.b) && bounded(edge.interactions) > 0)
    .map(edge => ({ ...edge, interactions: bounded(edge.interactions) }))
    .sort((a, b) => b.interactions - a.interactions || `${a.a}:${a.b}`.localeCompare(`${b.a}:${b.b}`));

  const prominence = normalizedLogs(uniqueNodes.map(node => node.messages));
  const edgeStrength = normalizedLogs(cleanEdges.map(edge => edge.interactions));
  const adjacency = new Map<string, Array<{ id: string; weight: number }>>();
  const degree = new Map<string, number>();
  for (const node of uniqueNodes) adjacency.set(node.id, []);
  cleanEdges.forEach((edge, index) => {
    const weight = 0.15 + (edgeStrength[index] ?? 0) * 0.85;
    adjacency.get(edge.a)?.push({ id: edge.b, weight });
    adjacency.get(edge.b)?.push({ id: edge.a, weight });
    degree.set(edge.a, (degree.get(edge.a) ?? 0) + edge.interactions);
    degree.set(edge.b, (degree.get(edge.b) ?? 0) + edge.interactions);
  });

  const clusterCount = uniqueNodes.length >= 500 ? 7 : uniqueNodes.length >= 180 ? 6 : uniqueNodes.length >= 60 ? 4 : Math.max(1, Math.min(3, uniqueNodes.length));
  const ranked = uniqueNodes.map(node => node.id).sort((a, b) => (degree.get(b) ?? 0) - (degree.get(a) ?? 0) || a.localeCompare(b));
  const seeds: string[] = [];
  for (const candidate of ranked) {
    if (seeds.length >= clusterCount) break;
    const links = adjacency.get(candidate) ?? [];
    const stronglyLinked = seeds.some(seed => links.some(link => link.id === seed && link.weight > 0.78));
    if (!stronglyLinked || seeds.length === 0) seeds.push(candidate);
  }
  for (const candidate of ranked) {
    if (seeds.length >= clusterCount) break;
    if (!seeds.includes(candidate)) seeds.push(candidate);
  }

  let assignments = new Map<string, number>();
  seeds.forEach((seed, index) => assignments.set(seed, index));
  for (const node of uniqueNodes) {
    if (assignments.has(node.id)) continue;
    let best = -1;
    let bestWeight = -1;
    for (const link of adjacency.get(node.id) ?? []) {
      const cluster = assignments.get(link.id);
      if (cluster != null && link.weight > bestWeight) { best = cluster; bestWeight = link.weight; }
    }
    assignments.set(node.id, best >= 0 ? best : hash(node.id) % Math.max(1, clusterCount));
  }
  for (let pass = 0; pass < 6; pass++) {
    const next = new Map(assignments);
    const sizes = new Map<number, number>();
    for (const cluster of assignments.values()) sizes.set(cluster, (sizes.get(cluster) ?? 0) + 1);
    const targetSize = Math.max(1, uniqueNodes.length / Math.max(1, clusterCount));
    for (const node of uniqueNodes) {
      if (seeds.includes(node.id)) continue;
      const scores = new Map<number, number>();
      for (const link of adjacency.get(node.id) ?? []) {
        const cluster = assignments.get(link.id)!;
        scores.set(cluster, (scores.get(cluster) ?? 0) + link.weight);
      }
      const current = assignments.get(node.id)!;
      const adjusted = [...scores].map(([cluster, score]) => {
        // Dense chats naturally form one giant connected component. A soft
        // capacity penalty preserves real neighbor affinity while preventing
        // every node from collapsing into the single highest-degree seed.
        const fullness = (sizes.get(cluster) ?? 0) / targetSize;
        const stability = cluster === current ? 1.08 : 1;
        return [cluster, score * stability / Math.pow(0.4 + fullness, 1.65)] as const;
      });
      const winner = adjusted.sort((a, b) => b[1] - a[1] || a[0] - b[0])[0]?.[0];
      if (winner != null) next.set(node.id, winner);
    }
    assignments = next;
  }

  const clusterWeight = new Map<number, number>();
  for (const node of uniqueNodes) {
    const cluster = assignments.get(node.id)!;
    clusterWeight.set(cluster, (clusterWeight.get(cluster) ?? 0) + (degree.get(node.id) ?? 0));
  }
  const clusterOrder = [...clusterWeight].sort((a, b) => b[1] - a[1] || a[0] - b[0]).map(([id]) => id);
  const remap = new Map(clusterOrder.map((id, index) => [id, index]));
  assignments = new Map([...assignments].map(([id, cluster]) => [id, remap.get(cluster) ?? 0]));

  const maxDegree = Math.max(1, ...degree.values());
  const connectivity = normalizedLogs(uniqueNodes.map(node => degree.get(node.id) ?? 0));
  const momentum = normalizedLogs(uniqueNodes.map(node => node.weeklyScore + node.reactions * 3 + node.recentMessages * 0.25));
  const influenceById = new Map(uniqueNodes.map((node, index) => [
    node.id,
    (prominence[index] ?? 0) * 0.46 + (connectivity[index] ?? 0) * 0.39 + (momentum[index] ?? 0) * 0.15,
  ]));

  const grouped = new Map<number, string[]>();
  for (const node of uniqueNodes) {
    const cluster = assignments.get(node.id)!;
    if (!grouped.has(cluster)) grouped.set(cluster, []);
    grouped.get(cluster)!.push(node.id);
  }
  for (const members of grouped.values()) members.sort((a, b) => (degree.get(b) ?? 0) - (degree.get(a) ?? 0) || a.localeCompare(b));

  const influenceOrder = uniqueNodes.map(node => node.id)
    .sort((a, b) => (influenceById.get(b) ?? 0) - (influenceById.get(a) ?? 0) || a.localeCompare(b));
  const layout = computeGalaxyLayout({
    ids: influenceOrder,
    clusterOf: assignments,
    clusterCount: clusterOrder.length,
  });

  const worldCount = Math.min(Math.max(1, uniqueNodes.length - 1), Math.max(6, Math.min(20, Math.round(uniqueNodes.length / 45))));
  const celestialOrder = influenceOrder;
  const sunId = celestialOrder[0];
  const planetIds = new Set(celestialOrder.slice(1, worldCount + 1));
  const position = spreadPlanets(layout.positions, [...planetIds]);
  const nodes: UniverseNode[] = uniqueNodes.map((node, index) => {
    const cluster = assignments.get(node.id) ?? 0;
    const neighbors = adjacency.get(node.id) ?? [];
    const neighborClusters = new Set(neighbors.map(link => assignments.get(link.id)));
    const degreeRatio = (degree.get(node.id) ?? 0) / maxDegree;
    const role = degreeRatio >= 0.55 ? 'Center of Gravity'
      : neighborClusters.size >= 4 && neighbors.length >= 6 ? 'Bridge Signal'
        : (prominence[index] ?? 0) >= 0.8 ? 'Prime Mover'
          : neighbors.length <= 2 ? 'Outer Orbit'
            : 'Constellation Regular';
    return {
      ...node,
      prominence: prominence[index] ?? 0,
      influence: influenceById.get(node.id) ?? 0,
      celestial: node.id === sunId ? 'sun' : planetIds.has(node.id) ? 'planet' : 'star',
      cluster,
      role,
      connections: neighbors.length,
      interactionTotal: degree.get(node.id) ?? 0,
      ...(position.get(node.id) ?? { x: 0, y: 0, z: 0 }),
    };
  });
  const edges: UniverseEdge[] = cleanEdges.map((edge, index) => {
    const strength = edgeStrength[index] ?? 0;
    return { ...edge, id: `${edge.a}\u0000${edge.b}`, strength, tier: connectionTier(strength) };
  });
  const byId = new Map(nodes.map(node => [node.id, node]));
  const centroidOf = (members: string[]) => {
    if (members.length === 0) return { x: 0, y: 0, z: 0 };
    const sum = { x: 0, y: 0, z: 0 };
    for (const id of members) {
      const p = position.get(id) ?? { x: 0, y: 0, z: 0 };
      sum.x += p.x; sum.y += p.y; sum.z += p.z;
    }
    return { x: sum.x / members.length, y: sum.y / members.length, z: sum.z / members.length };
  };
  const clusters: UniverseCluster[] = clusterOrder.map((_, id) => {
    const members = grouped.get(id) ?? [];
    const centralMember = members[0] ?? '';
    return {
      id,
      name: CLUSTERS[id % CLUSTERS.length]![0],
      color: CLUSTERS[id % CLUSTERS.length]![1],
      ...centroidOf(members),
      members: members.length,
      centralMember: byId.get(centralMember)?.id ?? centralMember,
    };
  });

  return {
    generatedAt: new Date().toISOString(),
    timeline,
    nodes,
    edges,
    clusters,
    stats: {
      members: nodes.length,
      connections: edges.length,
      interactions: edges.reduce((sum, edge) => sum + edge.interactions, 0),
    },
  };
}
