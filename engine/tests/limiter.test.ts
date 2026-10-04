import { describe, it, expect } from 'vitest';
import { LaneLimiter } from '@/lib/dispatch/limiter';

function makeClock(start = 0) {
  let t = start;
  return { now: () => t, advance: (ms: number) => { t += ms; } };
}

// re-check every real ms so fake-clock tests stay fast
const fastSleep = () => new Promise<void>(r => setTimeout(r, 1));

const cfg = { rpm: 60, tpm: 6000, dailyTokens: 20000 as number | null, dailyRequests: null as number | null };

describe('LaneLimiter', () => {
  it('admits immediately with full buckets and tracks usage', async () => {
    const clock = makeClock();
    const l = new LaneLimiter(cfg, clock.now, fastSleep);
    await l.acquire(1000);
    expect(l.snapshot().tokensToday).toBe(1000);
    expect(l.snapshot().requestsToday).toBe(1);
  });

  it('corrects the books when actual usage differs from the estimate', async () => {
    const l = new LaneLimiter(cfg, makeClock().now);
    await l.acquire(1000);
    l.recordUsage(1000, 1600);
    expect(l.snapshot().tokensToday).toBe(1600);
  });

  it('waits for TPM refill when the token bucket is empty', async () => {
    const clock = makeClock();
    const l = new LaneLimiter(cfg, clock.now, fastSleep);
    await l.acquire(6000); // drains the whole minute's tokens
    let resolved = false;
    const p = l.acquire(3000).then(() => { resolved = true; });
    await new Promise(r => setTimeout(r, 20));
    expect(resolved).toBe(false); // still parked (fake clock hasn't moved)
    clock.advance(30_001); // half a minute refills half the tpm
    await p;
    expect(resolved).toBe(true);
  });

  it('parks until UTC midnight when the daily token budget is exhausted', async () => {
    const clock = makeClock(Date.UTC(2026, 6, 4, 12, 0, 0));
    const l = new LaneLimiter({ ...cfg, tpm: 50000 }, clock.now, fastSleep);
    await l.acquire(19000);
    let resolved = false;
    const p = l.acquire(5000).then(() => { resolved = true; }); // would exceed 20k/day
    await new Promise(r => setTimeout(r, 20));
    expect(resolved).toBe(false);
    expect(l.snapshot().waitingForMidnight).toBe(true);
    clock.advance(12 * 3600_000 + 1000); // past midnight — budget resets
    await p;
    expect(l.snapshot().tokensToday).toBe(5000);
  });

  it('enforces dailyRequests when set', async () => {
    const clock = makeClock(Date.UTC(2026, 6, 4, 12, 0, 0));
    const l = new LaneLimiter({ rpm: 600, tpm: 1e9, dailyTokens: null, dailyRequests: 2 }, clock.now, fastSleep);
    await l.acquire(10);
    await l.acquire(10);
    const signal = { aborted: false };
    const p = l.acquire(10, signal).then(() => 'resolved', err => err);
    await new Promise(r => setTimeout(r, 20));
    expect(l.snapshot().waitingForMidnight).toBe(true);
    signal.aborted = true; // release the parked acquire so the loop exits
    expect(await p).toBeInstanceOf(Error);
  });

  it('pauseFor parks the lane and snapshot exposes it', async () => {
    const clock = makeClock(1_000_000);
    const l = new LaneLimiter(cfg, clock.now, fastSleep);
    l.pauseFor(60_000);
    expect(l.snapshot().pausedUntil).toBe(1_060_000);
    let resolved = false;
    const p = l.acquire(10).then(() => { resolved = true; });
    await new Promise(r => setTimeout(r, 20));
    expect(resolved).toBe(false);
    clock.advance(60_001);
    await p;
    expect(resolved).toBe(true);
  });

  it('aborts a parked acquire on shutdown signal', async () => {
    const clock = makeClock();
    const l = new LaneLimiter(cfg, clock.now, fastSleep);
    l.pauseFor(120_000);
    const signal = { aborted: false };
    const p = l.acquire(10, signal);
    setTimeout(() => { signal.aborted = true; }, 10);
    await expect(p).rejects.toThrow('shutdown');
  });
});
