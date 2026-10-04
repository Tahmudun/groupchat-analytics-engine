import { describe, expect, it } from 'vitest';
import {
  BULGE_HEIGHT, DISK_RADIUS, ORBIT_MAX, PLANET_MIN_DISTANCE, SUN_CLEARANCE,
  computeGalaxyLayout, orbitRingPositions, spreadPlanets, type Vec3,
} from '@/lib/universe/layout';

const input = (count: number, clusterCount = 7) => {
  const ids = Array.from({ length: count }, (_, i) => `member-${i}`);
  const clusterOf = new Map(ids.map((id, i) => [id, i % clusterCount]));
  return { ids, clusterOf, clusterCount };
};

describe('computeGalaxyLayout', () => {
  it('is deterministic and covers every id', () => {
    const first = computeGalaxyLayout(input(300));
    const second = computeGalaxyLayout(input(300));
    expect([...first.positions.entries()]).toEqual([...second.positions.entries()]);
    expect(first.positions.size).toBe(300);
  });

  it('pins the most prominent member at the origin', () => {
    const layout = computeGalaxyLayout(input(50));
    expect(layout.positions.get('member-0')).toEqual({ x: 0, y: 0, z: 0 });
  });

  it('keeps every position finite and inside the disk envelope', () => {
    const layout = computeGalaxyLayout(input(845));
    for (const p of layout.positions.values()) {
      expect(Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z)).toBe(true);
      expect(Math.hypot(p.x, p.z)).toBeLessThanOrEqual(DISK_RADIUS + 1);
      expect(Math.abs(p.y)).toBeLessThanOrEqual(BULGE_HEIGHT + 1);
    }
  });

  it('places more prominent members strictly closer to the core', () => {
    const layout = computeGalaxyLayout(input(200));
    const radius = (i: number) => {
      const p = layout.positions.get(`member-${i}`)!;
      return Math.hypot(p.x, p.z);
    };
    for (let i = 1; i < 199; i++) expect(radius(i)).toBeLessThan(radius(i + 1));
  });

  it('assigns every cluster an arm and returns one centerline per arm', () => {
    const layout = computeGalaxyLayout(input(300, 7));
    expect(layout.armOfCluster.size).toBe(7);
    const arms = new Set(layout.armOfCluster.values());
    expect(arms.size).toBeGreaterThanOrEqual(3);
    expect(arms.size).toBeLessThanOrEqual(4);
    expect(layout.armCenterlines.length).toBe(arms.size);
    for (const line of layout.armCenterlines) {
      expect(line.length).toBeGreaterThan(10);
      for (let i = 1; i < line.length; i++) {
        expect(Math.hypot(line[i]!.x, line[i]!.z)).toBeGreaterThan(Math.hypot(line[i - 1]!.x, line[i - 1]!.z));
      }
    }
  });

  it('handles tiny graphs without NaN', () => {
    for (const count of [1, 2, 3]) {
      const layout = computeGalaxyLayout(input(count, Math.min(count, 2)));
      expect(layout.positions.size).toBe(count);
      for (const p of layout.positions.values()) {
        expect(Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z)).toBe(true);
      }
    }
  });
});

describe('orbitRingPositions', () => {
  it('caps at ORBIT_MAX and is deterministic', () => {
    expect(orbitRingPositions(80).length).toBe(ORBIT_MAX);
    expect(orbitRingPositions(5)).toEqual(orbitRingPositions(5));
    expect(orbitRingPositions(0)).toEqual([]);
  });

  it('keeps every pair of offsets at least 55 units apart', () => {
    for (const count of [1, 4, 8, 9, 18, 24]) {
      const points = orbitRingPositions(count);
      for (let i = 0; i < points.length; i++) {
        for (let j = i + 1; j < points.length; j++) {
          const d = Math.hypot(
            points[i]!.x - points[j]!.x,
            points[i]!.y - points[j]!.y,
            points[i]!.z - points[j]!.z,
          );
          expect(d).toBeGreaterThan(55);
        }
      }
    }
  });
});

describe('spreadPlanets', () => {
  // Clumped worst case: all planets in a tight knot near the core, like real ranks.
  const clumped = (): Map<string, Vec3> => {
    const m = new Map<string, Vec3>();
    for (let i = 0; i < 19; i++) {
      m.set(`p${i}`, { x: 20 + i * 6, y: (i % 5) * 8 - 16, z: 30 - i * 4 });
    }
    m.set('star-a', { x: 400, y: 10, z: 400 });
    m.set('star-b', { x: 25, y: 0, z: 28 });
    return m;
  };
  const planetIds = Array.from({ length: 19 }, (_, i) => `p${i}`);

  it('enforces min pairwise distance between planets', () => {
    const out = spreadPlanets(clumped(), planetIds);
    for (let i = 0; i < planetIds.length; i++) {
      for (let j = i + 1; j < planetIds.length; j++) {
        const a = out.get(planetIds[i]!)!;
        const b = out.get(planetIds[j]!)!;
        const d = Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
        expect(d).toBeGreaterThanOrEqual(PLANET_MIN_DISTANCE - 1e-6);
      }
    }
  });

  it('keeps planets clear of the sun and inside the disk', () => {
    const out = spreadPlanets(clumped(), planetIds);
    for (const id of planetIds) {
      const p = out.get(id)!;
      const r = Math.hypot(p.x, p.z);
      expect(r).toBeGreaterThanOrEqual(SUN_CLEARANCE - 1e-6);
      expect(r).toBeLessThanOrEqual(DISK_RADIUS + 1e-6);
    }
  });

  it('is deterministic and ignores planet id input order', () => {
    const a = spreadPlanets(clumped(), planetIds);
    const b = spreadPlanets(clumped(), [...planetIds].reverse());
    for (const id of planetIds) expect(a.get(id)).toEqual(b.get(id));
  });

  it('leaves non-planet positions and planet heights untouched', () => {
    const input = clumped();
    const out = spreadPlanets(input, planetIds);
    expect(out.get('star-a')).toEqual(input.get('star-a'));
    expect(out.get('star-b')).toEqual(input.get('star-b'));
    for (const id of planetIds) {
      expect(out.get(id)!.y).toBeCloseTo(input.get(id)!.y, 6);
    }
  });
});
