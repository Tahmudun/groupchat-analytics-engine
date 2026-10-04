import type { LaneConfig } from '@/lib/providers/config';

export type LimiterSnapshot = {
  requestsToday: number;
  tokensToday: number;
  dailyTokenBudget: number | null;
  dailyRequestBudget: number | null;
  pausedUntil: number | null; // epoch ms, 429 backoff
  waitingForMidnight: boolean;
};

const sleep = (ms: number) => new Promise<void>(res => setTimeout(res, ms));

function nextUtcMidnight(now: number): number {
  const d = new Date(now);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1);
}

/**
 * Per-lane admission control: RPM + TPM as refilling token buckets, plus hard
 * daily request/token budgets that reset at UTC midnight. `acquire` blocks
 * until the request may go out; actual usage is reported back afterwards so
 * the token estimate self-corrects.
 */
export class LaneLimiter {
  private reqBucket: number;
  private tokBucket: number;
  private lastRefill: number;
  private utcDay: number;
  private requestsToday = 0;
  private tokensToday = 0;
  private pausedUntil: number | null = null;
  private waitingForMidnight = false;

  constructor(
    private readonly cfg: Pick<LaneConfig, 'rpm' | 'tpm' | 'dailyTokens' | 'dailyRequests'>,
    private readonly now: () => number = Date.now,
    private readonly sleepFn: (ms: number) => Promise<void> = sleep,
  ) {
    this.reqBucket = cfg.rpm;
    this.tokBucket = cfg.tpm;
    this.lastRefill = this.now();
    this.utcDay = new Date(this.now()).getUTCDate();
  }

  private refill(): void {
    const t = this.now();
    const dt = (t - this.lastRefill) / 60_000; // minutes
    this.lastRefill = t;
    this.reqBucket = Math.min(this.cfg.rpm, this.reqBucket + dt * this.cfg.rpm);
    this.tokBucket = Math.min(this.cfg.tpm, this.tokBucket + dt * this.cfg.tpm);
    const day = new Date(t).getUTCDate();
    if (day !== this.utcDay) {
      this.utcDay = day;
      this.requestsToday = 0;
      this.tokensToday = 0;
    }
  }

  /** ms until a request costing `tokens` may proceed; 0 = now. */
  private waitTime(tokens: number): number {
    this.refill();
    const t = this.now();
    if (this.pausedUntil !== null) {
      if (t < this.pausedUntil) return this.pausedUntil - t;
      this.pausedUntil = null;
    }
    if (
      (this.cfg.dailyRequests !== null && this.requestsToday + 1 > this.cfg.dailyRequests) ||
      (this.cfg.dailyTokens !== null && this.tokensToday + tokens > this.cfg.dailyTokens)
    ) {
      this.waitingForMidnight = true;
      return nextUtcMidnight(t) - t;
    }
    this.waitingForMidnight = false;
    const reqWait = this.reqBucket >= 1 ? 0 : ((1 - this.reqBucket) / this.cfg.rpm) * 60_000;
    const tokWait = this.tokBucket >= tokens ? 0 : ((tokens - this.tokBucket) / this.cfg.tpm) * 60_000;
    return Math.max(reqWait, tokWait);
  }

  async acquire(estimatedTokens: number, signal?: { aborted: boolean }): Promise<void> {
    while (true) {
      if (signal?.aborted) throw new Error('shutdown');
      const wait = this.waitTime(estimatedTokens);
      if (wait <= 0) break;
      await this.sleepFn(Math.min(wait, 5000)); // re-check often so pause/abort stay responsive
    }
    this.reqBucket -= 1;
    this.tokBucket -= estimatedTokens;
    this.requestsToday += 1;
    this.tokensToday += estimatedTokens;
  }

  /** Correct the books once the provider reports real usage. */
  recordUsage(estimatedTokens: number, actualTokens: number | null): void {
    if (actualTokens === null) return;
    const diff = actualTokens - estimatedTokens;
    this.tokensToday += diff;
    this.tokBucket = Math.min(this.cfg.tpm, this.tokBucket - diff);
  }

  /** 429 handling: park the lane until the provider says go. */
  pauseFor(ms: number): void {
    this.pausedUntil = Math.max(this.pausedUntil ?? 0, this.now() + ms);
  }

  snapshot(): LimiterSnapshot {
    this.refill();
    return {
      requestsToday: this.requestsToday,
      tokensToday: Math.round(this.tokensToday),
      dailyTokenBudget: this.cfg.dailyTokens,
      dailyRequestBudget: this.cfg.dailyRequests,
      pausedUntil: this.pausedUntil !== null && this.pausedUntil > this.now() ? this.pausedUntil : null,
      waitingForMidnight: this.waitingForMidnight,
    };
  }
}
