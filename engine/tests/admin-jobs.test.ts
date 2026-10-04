import { describe, it, expect, beforeEach } from 'vitest';
import { startJob, currentJob, _resetJobs, type JobProgress } from '@/lib/admin/jobs';

const tick = () => new Promise(res => setTimeout(res, 0));

describe('admin job registry', () => {
  beforeEach(() => _resetJobs());

  it('starts with no job', () => {
    expect(currentJob()).toBeNull();
  });

  it('runs a job to done and captures the result', async () => {
    const started = startJob('scores', async () => ({ rowsWritten: 42 }));
    expect(started.ok).toBe(true);
    expect(currentJob()?.state).toBe('running');
    await tick();
    const job = currentJob();
    expect(job?.state).toBe('done');
    expect(job?.result).toEqual({ rowsWritten: 42 });
    expect(job?.finishedAt).toBeDefined();
  });

  it('rejects a second job while one is running', async () => {
    let release!: () => void;
    startJob('sentiment', () => new Promise<void>(res => { release = res; }));
    await tick();  // Allow runner to execute and release to be assigned
    const second = startJob('scores', async () => null);
    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.busy.step).toBe('sentiment');
    release();
    await tick();
    expect(currentJob()?.state).toBe('done');
  });

  it('captures a failing runner as error state', async () => {
    startJob('mentions', async () => { throw new Error('boom'); });
    await tick();
    const job = currentJob();
    expect(job?.state).toBe('error');
    expect(job?.error).toContain('boom');
  });

  it('allows a new job after the previous one finished', async () => {
    startJob('mentions', async () => 'first');
    await tick();
    const started = startJob('scores', async () => 'second');
    expect(started.ok).toBe(true);
    await tick();
    expect(currentJob()?.step).toBe('scores');
  });

  it('captures a synchronously-throwing runner as error state', async () => {
    const started = startJob('mentions', () => { throw new Error('sync boom'); });
    expect(started.ok).toBe(true);
    await tick();
    const job = currentJob();
    expect(job?.state).toBe('error');
    expect(job?.error).toContain('sync boom');
    expect(startJob('scores', async () => null).ok).toBe(true);
  });

  it('exposes live progress from the runner while running', async () => {
    let release!: () => void;
    let report!: (p: JobProgress) => void;
    startJob('ingest', setProgress => {
      report = setProgress;
      return new Promise<void>(res => { release = res; });
    });
    await tick();
    report({ phase: 'parsing', parsed: 2000, inserted: 150, estimatedTotal: 10000 });
    expect(currentJob()?.progress).toEqual({ phase: 'parsing', parsed: 2000, inserted: 150, estimatedTotal: 10000 });
    report({ phase: 'finalizing', parsed: 2600, inserted: 200, estimatedTotal: 10000 });
    expect(currentJob()?.progress).toEqual({ phase: 'finalizing', parsed: 2600, inserted: 200, estimatedTotal: 10000 });
    release();
    await tick();
    expect(currentJob()?.state).toBe('done');
  });

  it('ignores progress reported after the job finished', async () => {
    let report!: (p: JobProgress) => void;
    startJob('ingest', async setProgress => { report = setProgress; });
    await tick();
    expect(currentJob()?.state).toBe('done');
    report({ phase: 'parsing', parsed: 1, inserted: 0 });
    expect(currentJob()?.progress).toBeUndefined();
  });
});
