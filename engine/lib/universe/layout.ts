export type Vec3 = { x: number; y: number; z: number };

export type GalaxyLayoutInput = {
  /** Ordered most→least prominent. ids[0] is pinned to the origin. */
  ids: string[];
  clusterOf: Map<string, number>;
  clusterCount: number;
};

export type GalaxyLayout = {
  positions: Map<string, Vec3>;
  armOfCluster: Map<number, number>;
  armCenterlines: Vec3[][];
};

export const DISK_RADIUS = 1000;
export const CORE_RADIUS = 140;
export const BULGE_HEIGHT = 120;
export const RIM_HEIGHT = 26;
const TWIST = 2.35; // radians of spiral twist from core to rim
const CENTERLINE_SAMPLES = 24;

/** FNV-1a hash mapped to [0, 1). Deterministic jitter source. */
function hashUnit(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 4294967296;
}

function armCount(clusterCount: number): number {
  if (clusterCount <= 0) return 1;
  if (clusterCount < 3) return clusterCount;
  return clusterCount >= 6 ? 4 : 3;
}

/** Radius grows with prominence rank on a power curve: rank 0 = origin. */
function radiusFor(rank: number, total: number): number {
  if (rank === 0) return 0;
  const t = total <= 1 ? 1 : rank / (total - 1);
  return CORE_RADIUS + (DISK_RADIUS - CORE_RADIUS) * Math.pow(t, 0.58);
}

function armAngle(arm: number, arms: number, phase: number, radius: number): number {
  return (arm / arms) * Math.PI * 2 + phase + (radius / DISK_RADIUS) * TWIST;
}

export function computeGalaxyLayout(input: GalaxyLayoutInput): GalaxyLayout {
  const arms = armCount(input.clusterCount);
  const armOfCluster = new Map<number, number>();
  const phaseOfCluster = new Map<number, number>();
  for (let cluster = 0; cluster < Math.max(1, input.clusterCount); cluster++) {
    armOfCluster.set(cluster, cluster % arms);
    // Clusters sharing an arm trail each other along it instead of stacking.
    phaseOfCluster.set(cluster, Math.floor(cluster / arms) * 0.85);
  }

  const positions = new Map<string, Vec3>();
  input.ids.forEach((id, rank) => {
    if (rank === 0) {
      positions.set(id, { x: 0, y: 0, z: 0 });
    } else {
      const cluster = input.clusterOf.get(id) ?? 0;
      const arm = armOfCluster.get(cluster) ?? 0;
      const phase = phaseOfCluster.get(cluster) ?? 0;
      const radius = radiusFor(rank, input.ids.length);
      const spread = 0.10 + (radius / DISK_RADIUS) * 0.26;
      const angle = armAngle(arm, arms, phase, radius) + (hashUnit(id) - 0.5) * spread * 2;
      const heightScale = BULGE_HEIGHT - (BULGE_HEIGHT - RIM_HEIGHT) * (radius / DISK_RADIUS);
      positions.set(id, {
        x: Math.cos(angle) * radius,
        y: (hashUnit(`${id}:y`) - 0.5) * 2 * heightScale,
        z: Math.sin(angle) * radius,
      });
    }
  });

  const armCenterlines: Vec3[][] = [];
  for (let arm = 0; arm < arms; arm++) {
    const line: Vec3[] = [];
    for (let s = 0; s <= CENTERLINE_SAMPLES; s++) {
      const radius = CORE_RADIUS + (DISK_RADIUS - CORE_RADIUS) * (s / CENTERLINE_SAMPLES);
      const angle = armAngle(arm, arms, 0, radius);
      line.push({ x: Math.cos(angle) * radius, y: 0, z: Math.sin(angle) * radius });
    }
    armCenterlines.push(line);
  }

  return { positions, armOfCluster, armCenterlines };
}

export const ORBIT_RING_RADII = [150, 260, 370] as const;
export const ORBIT_RING_CAPACITY = [8, 10, 6] as const;
export const ORBIT_MAX = 24;

/** Collision-free local offsets for "My Orbit": up to three rings around the
 * root, even angular spacing, gentle per-ring vertical tilt. */
export function orbitRingPositions(count: number): Vec3[] {
  const total = Math.max(0, Math.min(count, ORBIT_MAX));
  const out: Vec3[] = [];
  let placed = 0;
  for (let ring = 0; ring < ORBIT_RING_RADII.length && placed < total; ring++) {
    const capacity = Math.min(ORBIT_RING_CAPACITY[ring]!, total - placed);
    for (let i = 0; i < capacity; i++) {
      const angle = (i / capacity) * Math.PI * 2 + ring * 0.55;
      const radius = ORBIT_RING_RADII[ring]!;
      out.push({
        x: Math.cos(angle) * radius,
        y: Math.sin(angle * 2 + ring) * (14 + ring * 9),
        z: Math.sin(angle) * radius,
      });
      placed++;
    }
  }
  return out;
}

export const PLANET_MIN_DISTANCE = 220;
export const SUN_CLEARANCE = 210;
const SPREAD_ITERATIONS = 200;

/** Deterministic push-apart for planet rest positions. Planets are the top
 * influence ranks, so the base layout clumps them all near the core; this
 * pass separates them in the XZ plane (disk heights stay) while keeping a
 * clearance ring around the sun at the origin. Non-planet ids are untouched. */
export function spreadPlanets(
  positions: Map<string, Vec3>,
  planetIds: string[],
  minDistance = PLANET_MIN_DISTANCE,
): Map<string, Vec3> {
  const out = new Map(positions);
  const ids = [...planetIds].filter(id => out.has(id)).sort();
  const pts = ids.map(id => ({ ...out.get(id)! }));

  for (let iter = 0; iter < SPREAD_ITERATIONS; iter++) {
    let moved = false;
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i]!;
      const rSun = Math.hypot(p.x, p.z);
      if (rSun < SUN_CLEARANCE) {
        const angle = rSun < 1e-6 ? (i / Math.max(1, pts.length)) * Math.PI * 2 : Math.atan2(p.z, p.x);
        p.x = Math.cos(angle) * SUN_CLEARANCE;
        p.z = Math.sin(angle) * SUN_CLEARANCE;
        moved = true;
      }
      for (let j = i + 1; j < pts.length; j++) {
        const q = pts[j]!;
        const d = Math.hypot(q.x - p.x, q.y - p.y, q.z - p.z);
        if (d >= minDistance) continue;
        let ux = q.x - p.x;
        let uz = q.z - p.z;
        const len = Math.hypot(ux, uz);
        if (len < 1e-6) { ux = 1; uz = 0; } else { ux /= len; uz /= len; }
        const push = (minDistance - d) / 2 + 0.5;
        p.x -= ux * push; p.z -= uz * push;
        q.x += ux * push; q.z += uz * push;
        moved = true;
      }
    }
    if (!moved) break;
  }

  for (const p of pts) {
    const r = Math.hypot(p.x, p.z);
    if (r > DISK_RADIUS) { p.x *= DISK_RADIUS / r; p.z *= DISK_RADIUS / r; }
  }
  ids.forEach((id, i) => out.set(id, pts[i]!));
  return out;
}
