/**
 * Seeded PRNG for the synthetic chat generator. Same seed → byte-identical
 * export, so the demo dataset is reproducible and diffable.
 * mulberry32: tiny, fast, and plenty random for simulation (not crypto).
 */
export class Rng {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0;
  }

  /** Uniform float in [0, 1). */
  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Independent child stream — lets one subsystem draw more or fewer numbers
   *  without shifting every later draw in another. */
  fork(label: string): Rng {
    let h = this.state ^ 0x9e3779b9;
    for (let i = 0; i < label.length; i++) h = Math.imul(h ^ label.charCodeAt(i), 0x01000193);
    return new Rng(h >>> 0);
  }

  int(minInclusive: number, maxInclusive: number): number {
    return minInclusive + Math.floor(this.next() * (maxInclusive - minInclusive + 1));
  }

  chance(p: number): boolean {
    return this.next() < p;
  }

  pick<T>(items: readonly T[]): T {
    if (items.length === 0) throw new Error('pick from empty list');
    return items[Math.floor(this.next() * items.length)]!;
  }

  /** Weighted pick; weights need not sum to 1. Zero/negative weights never win. */
  weighted<T>(items: readonly T[], weight: (item: T) => number): T {
    let total = 0;
    for (const it of items) total += Math.max(0, weight(it));
    if (total <= 0) return this.pick(items);
    let r = this.next() * total;
    for (const it of items) {
      r -= Math.max(0, weight(it));
      if (r < 0) return it;
    }
    return items[items.length - 1]!;
  }

  /** Standard normal via Box–Muller. */
  normal(mean = 0, sd = 1): number {
    const u = 1 - this.next();
    const v = this.next();
    return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  /** Log-normal with the given median — inter-message gaps are heavy-tailed. */
  logNormal(median: number, sigma: number): number {
    return median * Math.exp(this.normal(0, sigma));
  }

  /** Poisson draw (Knuth for small λ, normal approximation above 30). */
  poisson(lambda: number): number {
    if (lambda <= 0) return 0;
    if (lambda > 30) return Math.max(0, Math.round(this.normal(lambda, Math.sqrt(lambda))));
    const limit = Math.exp(-lambda);
    let k = 0;
    let p = 1;
    do {
      k += 1;
      p *= this.next();
    } while (p > limit);
    return k - 1;
  }

  /** k distinct items, order randomized. */
  sample<T>(items: readonly T[], k: number): T[] {
    const copy = [...items];
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      [copy[i], copy[j]] = [copy[j]!, copy[i]!];
    }
    return copy.slice(0, Math.min(k, copy.length));
  }
}
