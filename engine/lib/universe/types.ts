export type UniverseSourceNode = {
  id: string;
  name: string;
  messages: number;
  recentMessages: number;
  reactions: number;
  weeklyScore: number;
  firstActive: string;
  lastActive: string;
  history: number[];
};

export type UniverseSourceEdge = {
  a: string;
  b: string;
  interactions: number;
};

export type UniverseNode = UniverseSourceNode & {
  prominence: number;
  influence: number;
  celestial: 'sun' | 'planet' | 'star';
  cluster: number;
  role: string;
  connections: number;
  interactionTotal: number;
  x: number;
  y: number;
  z: number;
};

export type UniverseEdge = UniverseSourceEdge & {
  id: string;
  strength: number;
  tier: 'Core connection' | 'Frequent co-stars' | 'Recurring orbit';
};

export type UniverseCluster = {
  id: number;
  name: string;
  color: string;
  x: number;
  y: number;
  z: number;
  members: number;
  centralMember: string;
};

export type UniverseGraph = {
  generatedAt: string;
  timeline: string[];
  nodes: UniverseNode[];
  edges: UniverseEdge[];
  clusters: UniverseCluster[];
  stats: { members: number; connections: number; interactions: number };
};
