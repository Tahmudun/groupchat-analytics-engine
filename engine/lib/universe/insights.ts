import type { UniverseEdge, UniverseGraph, UniverseNode } from './types';

type CommunityMetric = 'cohesion' | 'reach' | 'activity' | 'momentum' | 'response' | 'tenure' | 'variance';
type CommunityArchetype = {
  title: string;
  metric: CommunityMetric;
  summary: string;
  temperament: string;
};

const ARCHETYPES: CommunityArchetype[] = [
  { title: 'The Inner Circle', metric: 'cohesion', summary: 'A tight pocket where conversation repeatedly returns to familiar people.', temperament: 'protective and water-like' },
  { title: 'The Crossroads', metric: 'reach', summary: 'The routing layer of the chat: people here carry energy between otherwise separate circles.', temperament: 'social and air-like' },
  { title: 'The Main Stage', metric: 'activity', summary: 'A high-output region whose members supply a large share of the chat’s visible momentum.', temperament: 'expressive and fire-like' },
  { title: 'The Live Wire', metric: 'momentum', summary: 'The region currently accelerating fastest through recent messages, reactions, and score.', temperament: 'restless and spark-like' },
  { title: 'The Chorus', metric: 'response', summary: 'A responsive community that amplifies moments through reactions and conversational follow-through.', temperament: 'communal and Venusian' },
  { title: 'The Old Guard', metric: 'tenure', summary: 'A long-running part of the social fabric, defined by continuity and accumulated history.', temperament: 'grounded and earth-like' },
  { title: 'The Wildcards', metric: 'variance', summary: 'A mixed-frequency region where major presences and occasional surprise appearances coexist.', temperament: 'mutable and unpredictable' },
];

type RawCommunity = {
  id: number;
  cohesion: number;
  reach: number;
  activity: number;
  momentum: number;
  response: number;
  tenure: number;
  variance: number;
  internalWeight: number;
  externalWeight: number;
  crossClusters: number;
  recentReactions: number;
};

export type CommunityInsight = {
  id: number;
  name: string;
  color: string;
  archetype: string;
  summary: string;
  temperament: string;
  cohesionPercent: number;
  crossPercent: number;
  evidence: string[];
  notableMembers: UniverseNode[];
};

export type RoleInsight = {
  title: string;
  summary: string;
  evidence: string[];
  influenceRank: number;
  messageRank: number;
  totalMembers: number;
  celestialReason: string;
};

export type OrbitMember = {
  node: UniverseNode;
  edge: UniverseEdge;
};

export type MemberInsight = {
  node: UniverseNode;
  role: RoleInsight;
  community: CommunityInsight;
  orbit: OrbitMember[];
};

const average = (values: number[]) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
const finiteDate = (value: string) => Number.isFinite(Date.parse(value)) ? Date.parse(value) : 0;

function normalizedByMetric(rows: RawCommunity[], metric: CommunityMetric): Map<number, number> {
  const values = rows.map(row => row[metric]);
  const min = Math.min(...values);
  const max = Math.max(...values);
  return new Map(rows.map(row => [row.id, max === min ? 0.5 : (row[metric] - min) / (max - min)]));
}

export function communityInsights(graph: UniverseGraph): Map<number, CommunityInsight> {
  const clusterOf = new Map(graph.nodes.map(node => [node.id, node.cluster]));
  const latestActivity = Math.max(0, ...graph.nodes.map(node => finiteDate(node.lastActive)));
  const raw: RawCommunity[] = graph.clusters.map(cluster => {
    const members = graph.nodes.filter(node => node.cluster === cluster.id);
    let internalWeight = 0;
    let externalWeight = 0;
    const cross = new Set<number>();
    for (const edge of graph.edges) {
      const a = clusterOf.get(edge.a);
      const b = clusterOf.get(edge.b);
      if (a === cluster.id && b === cluster.id) internalWeight += edge.interactions * 2;
      else if (a === cluster.id || b === cluster.id) {
        externalWeight += edge.interactions;
        const other = a === cluster.id ? b : a;
        if (other != null) cross.add(other);
      }
    }
    const totalWeight = internalWeight + externalWeight;
    const prominence = members.map(node => node.prominence);
    const prominenceMean = average(prominence);
    const variance = Math.sqrt(average(prominence.map(value => Math.pow(value - prominenceMean, 2))));
    return {
      id: cluster.id,
      cohesion: totalWeight ? internalWeight / totalWeight : 0,
      reach: totalWeight ? (externalWeight / totalWeight) * (1 + cross.size / Math.max(1, graph.clusters.length - 1)) : 0,
      activity: prominenceMean,
      momentum: average(members.map(node => Math.log1p(node.weeklyScore + node.reactions * 3 + node.recentMessages * 0.25))),
      response: average(members.map(node => Math.log1p(node.reactions))),
      tenure: average(members.map(node => Math.max(0, latestActivity - finiteDate(node.firstActive)))),
      variance,
      internalWeight,
      externalWeight,
      crossClusters: cross.size,
      recentReactions: members.reduce((sum, node) => sum + node.reactions, 0),
    };
  });

  const normalized = new Map(ARCHETYPES.map(archetype => [archetype.metric, normalizedByMetric(raw, archetype.metric)]));
  const remaining = new Set(raw.map(row => row.id));
  const archetypeOf = new Map<number, CommunityArchetype>();
  for (const archetype of ARCHETYPES.slice(0, raw.length)) {
    const scores = normalized.get(archetype.metric)!;
    const winner = [...remaining].sort((a, b) => (scores.get(b) ?? 0) - (scores.get(a) ?? 0) || a - b)[0];
    if (winner == null) break;
    remaining.delete(winner);
    archetypeOf.set(winner, archetype);
  }

  const output = new Map<number, CommunityInsight>();
  for (const cluster of graph.clusters) {
    const row = raw.find(item => item.id === cluster.id)!;
    const archetype = archetypeOf.get(cluster.id) ?? ARCHETYPES[cluster.id % ARCHETYPES.length]!;
    const totalWeight = row.internalWeight + row.externalWeight;
    const cohesionPercent = totalWeight ? Math.round(row.internalWeight / totalWeight * 100) : 0;
    const crossPercent = 100 - cohesionPercent;
    let evidence: string[];
    switch (archetype.metric) {
      case 'cohesion': evidence = [`${cohesionPercent}% of retained interaction weight stays inside this region.`, `${cluster.members.toLocaleString('en-US')} members reinforce its shared conversational center.`]; break;
      case 'reach': evidence = [`${crossPercent}% of retained interaction weight crosses community boundaries.`, `Members connect this region to ${row.crossClusters} other communities.`]; break;
      case 'activity': evidence = [`Members average ${Math.round(row.activity * 100)}% on the normalized message-prominence scale.`, `${cluster.members.toLocaleString('en-US')} voices contribute to this high-output region.`]; break;
      case 'momentum': evidence = ['Recent messages, reactions, and weekly score give this region its strongest signature.', `${row.recentReactions.toLocaleString('en-US')} reactions were received by its members in the current seven-day window.`]; break;
      case 'response': evidence = [`${row.recentReactions.toLocaleString('en-US')} recent reactions create its response-heavy signature.`, `${cohesionPercent}% of its retained interaction weight remains internal.`]; break;
      case 'tenure': evidence = ['Member history gives this region one of the graph’s strongest continuity signatures.', `${cluster.members.toLocaleString('en-US')} members currently occupy the region.`]; break;
      default: evidence = ['Its members have one of the widest spreads of message prominence in the graph.', 'That mixture makes its activity harder to predict from one central pattern.'];
    }
    output.set(cluster.id, {
      id: cluster.id,
      name: cluster.name,
      color: cluster.color,
      archetype: archetype.title,
      summary: archetype.summary,
      temperament: archetype.temperament,
      cohesionPercent,
      crossPercent,
      evidence,
      notableMembers: graph.nodes.filter(node => node.cluster === cluster.id)
        .sort((a, b) => b.influence - a.influence || a.id.localeCompare(b.id)).slice(0, 6),
    });
  }
  return output;
}

export function memberOrbit(graph: UniverseGraph, id: string): OrbitMember[] {
  const byId = new Map(graph.nodes.map(node => [node.id, node]));
  return graph.edges
    .filter(edge => edge.a === id || edge.b === id)
    .sort((a, b) => b.interactions - a.interactions || a.id.localeCompare(b.id))
    .slice(0, 24)
    .flatMap(edge => {
      const node = byId.get(edge.a === id ? edge.b : edge.a);
      return node ? [{ node, edge }] : [];
    });
}

export function roleInsight(graph: UniverseGraph, node: UniverseNode): RoleInsight {
  const sortedInfluence = [...graph.nodes].sort((a, b) => b.influence - a.influence || a.id.localeCompare(b.id));
  const sortedMessages = [...graph.nodes].sort((a, b) => b.messages - a.messages || a.id.localeCompare(b.id));
  const influenceRank = sortedInfluence.findIndex(member => member.id === node.id) + 1;
  const messageRank = sortedMessages.findIndex(member => member.id === node.id) + 1;
  const maxInteractions = Math.max(1, ...graph.nodes.map(member => member.interactionTotal));
  const orbit = memberOrbit(graph, node.id);
  const communitiesReached = new Set(orbit.map(member => member.node.cluster)).size;
  const share = Math.round(node.interactionTotal / maxInteractions * 100);
  let summary: string;
  let evidence: string[];
  if (node.role === 'Center of Gravity') {
    summary = 'Conversation repeatedly bends back toward you. You are one of the graph’s strongest interaction centers.';
    evidence = [`Your ${node.interactionTotal.toLocaleString('en-US')} shared signals equal ${share}% of the graph leader’s total.`, `${node.connections.toLocaleString('en-US')} retained connections feed that gravitational pull.`];
  } else if (node.role === 'Bridge Signal') {
    summary = 'You move between circles. Your importance comes from connecting communities that would otherwise feel farther apart.';
    evidence = [`Your retained orbit reaches ${communitiesReached} structural communities.`, `${node.connections.toLocaleString('en-US')} connections give you multiple routes through the chat.`];
  } else if (node.role === 'Prime Mover') {
    summary = 'Your message output materially changes the pace of the room, even when you are not its largest connector.';
    evidence = [`You rank #${messageRank} of ${graph.nodes.length.toLocaleString('en-US')} by all-time messages.`, `Your normalized message prominence is ${Math.round(node.prominence * 100)}%.`];
  } else if (node.role === 'Outer Orbit') {
    summary = 'You participate selectively. Your graph is defined by a small number of specific routes rather than broad reach.';
    evidence = [`You have ${node.connections} retained connection${node.connections === 1 ? '' : 's'}.`, 'A small orbit can represent focused participation, limited activity, or a narrow conversational lane.'];
  } else {
    summary = 'You are part of the connective fabric: present, recognizable, and balanced without being reduced to one extreme.';
    evidence = [`You hold ${node.connections.toLocaleString('en-US')} retained connections and ${node.interactionTotal.toLocaleString('en-US')} shared signals.`, `Your blended influence ranks #${influenceRank} of ${graph.nodes.length.toLocaleString('en-US')}.`];
  }
  const celestialReason = node.celestial === 'sun'
    ? 'You are the stellar core because you rank first in blended influence.'
    : node.celestial === 'planet'
      ? `You are a major world because your blended influence ranks #${influenceRank}.`
      : `You appear in the deep field at blended influence rank #${influenceRank}.`;
  return { title: node.role, summary, evidence, influenceRank, messageRank, totalMembers: graph.nodes.length, celestialReason };
}

export function buildMemberInsight(graph: UniverseGraph, id: string): MemberInsight | null {
  const node = graph.nodes.find(member => member.id === id);
  if (!node) return null;
  const community = communityInsights(graph).get(node.cluster);
  if (!community) return null;
  return { node, role: roleInsight(graph, node), community, orbit: memberOrbit(graph, id) };
}
