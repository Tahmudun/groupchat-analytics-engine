// Pure label selection + screen-space picking. No DOM, no three.
import type { UniverseGraph } from '@/lib/universe/types';
import type { SceneState } from './starAttributes';

export type ProjectedStar = {
  id: string;
  x: number;
  y: number;
  /** NDC depth (smaller = nearer). */
  depth: number;
  radius: number;
  alpha: number;
};

export type PlacedLabel = {
  id: string;
  text: string;
  x: number;
  y: number;
  anchorX: number;
  anchorY: number;
  nudged: boolean;
  emphasized: boolean;
  sub?: string;
};

const MARGIN = 80;
const LABEL_MARGIN = 10;
const NUDGE_STEP = 24;
const MAX_NUDGE_ATTEMPTS = 12;
/** Stars need a projected footprint at least this big (px) to earn a
 * proximity label — i.e. the camera is close to them. */
const STAR_LABEL_RADIUS = 6;
const STAR_LABEL_CAP_FINE = 12;
const STAR_LABEL_CAP_COARSE = 3;
const TOTAL_STAR_LABEL_CAP = 16;
const WORLD_LABEL_CAP_COARSE = 5;

function overlaps(
  box: { left: number; right: number; top: number; bottom: number },
  occupied: Array<{ left: number; right: number; top: number; bottom: number }>,
): boolean {
  return occupied.some(other =>
    box.left < other.right && box.right > other.left && box.top < other.bottom && box.bottom > other.top);
}

export function chooseLabels(
  graph: UniverseGraph,
  state: SceneState,
  projected: Map<string, ProjectedStar>,
  view: { width: number; height: number; coarse: boolean; hoveredId?: string | null },
  measure: (text: string, emphasized: boolean) => number,
): PlacedLabel[] {
  const emphasizedIds = new Set([
    state.selectedId, state.orbitRoot, state.relationship?.a, state.relationship?.b,
  ].filter((v): v is string => Boolean(v)));

  const inOrbit = state.mode === 'orbit' && state.orbitRoot;
  const orbitNeighbors = inOrbit
    ? new Set(graph.edges
        .filter(e => e.a === state.orbitRoot || e.b === state.orbitRoot)
        .map(e => (e.a === state.orbitRoot ? e.b : e.a)))
    : null;

  const visible = (id: string): ProjectedStar | null => {
    const p = projected.get(id);
    if (!p) return null;
    if (p.alpha < 0.15) return null;
    if (p.x < -MARGIN || p.x > view.width + MARGIN || p.y < -MARGIN || p.y > view.height + MARGIN) return null;
    return p;
  };

  // Worlds first (always labeled), then emphasized/hovered stars, then
  // proximity stars ranked by distance to the viewport center.
  const worlds = graph.nodes.filter(n => n.celestial !== 'star');
  const stars = graph.nodes.filter(n => n.celestial === 'star');
  const centerX = view.width / 2;
  const centerY = view.height / 2;
  const starCandidates = stars
    .map(nodeOf => ({ nodeOf, p: visible(nodeOf.id) }))
    .filter((c): c is { nodeOf: (typeof stars)[number]; p: ProjectedStar } => {
      if (!c.p) return false;
      const forced = emphasizedIds.has(c.nodeOf.id)
        || view.hoveredId === c.nodeOf.id
        || Boolean(inOrbit && orbitNeighbors!.has(c.nodeOf.id));
      if (forced) return true;
      if (inOrbit) return false;
      return c.p.radius >= STAR_LABEL_RADIUS;
    })
    .sort((a, b) => {
      const fa = Number(emphasizedIds.has(a.nodeOf.id) || view.hoveredId === a.nodeOf.id);
      const fb = Number(emphasizedIds.has(b.nodeOf.id) || view.hoveredId === b.nodeOf.id);
      if (fa !== fb) return fb - fa;
      const da = Math.hypot(a.p.x - centerX, a.p.y - centerY);
      const db = Math.hypot(b.p.x - centerX, b.p.y - centerY);
      return da - db;
    })
    .slice(0, Math.min(TOTAL_STAR_LABEL_CAP, view.coarse ? STAR_LABEL_CAP_COARSE : STAR_LABEL_CAP_FINE));

  const placed: PlacedLabel[] = [];
  const occupied: Array<{ left: number; right: number; top: number; bottom: number }> = [];

  // Keep callouts off the world bodies as well as off one another. The
  // slightly enlarged footprint also protects most ring silhouettes.
  for (const node of worlds) {
    const p = visible(node.id);
    if (!p) continue;
    const r = Math.max(12, p.radius * 1.35);
    occupied.push({ left: p.x - r, right: p.x + r, top: p.y - r, bottom: p.y + r });
  }

  const place = (id: string, name: string, role: string, p: ProjectedStar, mustPlace: boolean, emphasized: boolean) => {
    const text = name.length > 24 ? `${name.slice(0, 22)}…` : name;
    const width = measure(text, emphasized) + 12;
    const topOffset = 13;
    const bottomOffset = emphasized ? 17 : 8;
    const initial = { x: p.x, y: p.y + p.radius + 17 };
    const candidates: Array<{ x: number; y: number }> = [initial];

    if (mustPlace) {
      candidates.push(
        { x: p.x, y: p.y - p.radius - bottomOffset - 7 },
        { x: p.x + p.radius + width / 2 + 10, y: p.y + 4 },
        { x: p.x - p.radius - width / 2 - 10, y: p.y + 4 },
      );
      for (let ring = 1; ring <= MAX_NUDGE_ATTEMPTS; ring++) {
        const radius = p.radius + 18 + ring * NUDGE_STEP;
        for (let step = 0; step < 16; step++) {
          const angle = Math.PI / 2 + (step / 16) * Math.PI * 2;
          candidates.push({ x: p.x + Math.cos(angle) * radius, y: p.y + Math.sin(angle) * radius });
        }
      }
      // Dense phone projections occasionally exhaust the radial candidates.
      // A bounded screen grid is a deterministic last resort and still keeps
      // all 20 named worlds visible without allowing an overlap.
      for (let y = 30; y < view.height - 22; y += 30) {
        for (let x = LABEL_MARGIN + width / 2; x < view.width - LABEL_MARGIN - width / 2; x += 34) {
          candidates.push({ x, y });
        }
      }
    }

    let chosen: { x: number; y: number; box: { left: number; right: number; top: number; bottom: number } } | null = null;
    for (const candidate of candidates) {
      const box = {
        left: candidate.x - width / 2,
        right: candidate.x + width / 2,
        top: candidate.y - topOffset,
        bottom: candidate.y + bottomOffset,
      };
      const inside = box.left >= LABEL_MARGIN && box.right <= view.width - LABEL_MARGIN
        && box.top >= LABEL_MARGIN && box.bottom <= view.height - LABEL_MARGIN;
      if (inside && !overlaps(box, occupied)) { chosen = { ...candidate, box }; break; }
    }
    if (!chosen) return;
    const { x, y, box } = chosen;
    occupied.push(box);
    placed.push({
      id, text, x, y,
      anchorX: p.x, anchorY: p.y + p.radius,
      nudged: Math.abs(x - initial.x) > 1 || Math.abs(y - initial.y) > 1,
      emphasized,
      ...(emphasized ? { sub: role } : {}),
    });
  };

  const worldCandidates = worlds
    .map(nodeOf => ({ nodeOf, p: visible(nodeOf.id) }))
    .filter((candidate): candidate is { nodeOf: (typeof worlds)[number]; p: ProjectedStar } => Boolean(candidate.p))
    .filter(({ nodeOf, p }) => !inOrbit || emphasizedIds.has(nodeOf.id) || orbitNeighbors!.has(nodeOf.id) || p.alpha >= 0.5)
    .sort((a, b) => {
      const forcedA = Number(emphasizedIds.has(a.nodeOf.id));
      const forcedB = Number(emphasizedIds.has(b.nodeOf.id));
      if (forcedA !== forcedB) return forcedB - forcedA;
      const distanceA = Math.hypot(a.p.x - centerX, a.p.y - centerY);
      const distanceB = Math.hypot(b.p.x - centerX, b.p.y - centerY);
      return distanceA - distanceB || b.nodeOf.influence - a.nodeOf.influence || a.nodeOf.id.localeCompare(b.nodeOf.id);
    });

  const labeledWorlds = view.coarse ? worldCandidates.slice(0, WORLD_LABEL_CAP_COARSE) : worldCandidates;
  for (const { nodeOf, p } of labeledWorlds) {
    // On phones, only the active world gets the large two-line treatment.
    // Nearby worlds remain discoverable without turning the viewport into a
    // wall of equally loud callouts.
    const emphasized = !view.coarse || emphasizedIds.has(nodeOf.id);
    place(nodeOf.id, nodeOf.name, nodeOf.role, p, true, emphasized);
  }
  for (const { nodeOf, p } of starCandidates) {
    const emphasized = emphasizedIds.has(nodeOf.id);
    place(nodeOf.id, nodeOf.name, nodeOf.role, p, emphasized || view.hoveredId === nodeOf.id, emphasized);
  }
  return placed;
}

export function pickStar(x: number, y: number, projected: Iterable<ProjectedStar>): string | null {
  let best: { id: string; distance: number; depth: number } | null = null;
  for (const p of projected) {
    if (p.alpha < 0.08) continue;
    const distance = Math.hypot(x - p.x, y - p.y);
    const hit = Math.max(17, p.radius + 9);
    if (distance > hit) continue;
    if (!best || distance < best.distance - 2 || (Math.abs(distance - best.distance) <= 2 && p.depth < best.depth)) {
      best = { id: p.id, distance, depth: p.depth };
    }
  }
  return best?.id ?? null;
}
