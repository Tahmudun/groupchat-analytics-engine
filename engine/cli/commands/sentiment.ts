import { Command } from 'commander';
import { runSentiment } from '@/lib/sentiment/run';
import { sql } from '@/lib/db/client';
import { loadProvidersConfig, buildLanes } from '@/lib/providers/config';
import type { ProviderId } from '@/lib/providers/types';
import { runDispatcher } from '@/lib/dispatch/dispatcher';
import { startMonitor } from '@/lib/dispatch/monitor';
import { fetchCalibrationSample, calibrateLane, printCalibrationTable, DEFAULT_REFERENCE, DEFAULT_SAMPLE } from '@/lib/dispatch/calibrate';

export function makeSentimentCommand(): Command {
  const cmd = new Command('sentiment').description('Mention extraction + LLM sentiment');
  cmd.command('run')
    .requiredOption('--chat <slug>')
    .option('--full-rerun', 'reclassify even cached messages')
    .option('--since <date>', 'only scan messages after this ISO date')
    .option('--limit <n>', 'stop after classifying N messages (for testing)', v => parseInt(v, 10))
    .option('--batch-size <n>', 'messages per LLM call (default 25)', v => parseInt(v, 10))
    .option('--verbose')
    .action(async (opts: { chat: string; fullRerun?: boolean; since?: string; limit?: number; batchSize?: number; verbose?: boolean }) => {
      const report = await runSentiment(opts.chat, {
        fullRerun: opts.fullRerun,
        since: opts.since ? new Date(opts.since) : undefined,
        limit: opts.limit,
        batchSize: opts.batchSize,
        verbose: opts.verbose,
      });
      console.log(JSON.stringify(report, null, 2));
      await sql.end();
    });

  cmd.command('dispatch')
    .description('Classify pending mentions through all configured free-tier lanes in parallel')
    .requiredOption('--chat <slug>')
    .option('--providers <list>', 'comma-separated subset (mistral,gemini,cerebras,groq)')
    .option('--limit <n>', 'stop after N messages total (for testing)', v => parseInt(v, 10))
    .option('--batch-size <n>', 'override messages per provider call (useful for drain repair)', v => parseInt(v, 10))
    .option('--ensemble', 'run every selected model for every affected target')
    .option('--new-messages-since <date>', 'ensemble scope: include mentions in messages from this ISO date')
    .option('--aliases-since <date>', 'ensemble scope: include historical mentions matched by aliases created from this ISO date')
    .option('--retry-drains', 'ensemble scope: retry confidence-0 neutral drains')
    .option('--drains-only', 'ensemble scope: retry only existing confidence-0 rows (never uncached rows)')
    .option('--verbose')
    .action(async (opts: { chat: string; providers?: string; limit?: number; batchSize?: number; ensemble?: boolean; newMessagesSince?: string; aliasesSince?: string; retryDrains?: boolean; drainsOnly?: boolean; verbose?: boolean }) => {
      const only = opts.providers?.split(',').map(s => s.trim()) as ProviderId[] | undefined;
      if (opts.drainsOnly && !opts.ensemble) {
        console.error('--drains-only requires --ensemble');
        process.exitCode = 1;
        await sql.end();
        return;
      }
      if (opts.ensemble && !opts.newMessagesSince && !opts.aliasesSince && !opts.drainsOnly) {
        console.error('--ensemble requires --new-messages-since, --aliases-since, or --drains-only to keep the run bounded');
        process.exitCode = 1;
        await sql.end();
        return;
      }
      const config = await loadProvidersConfig();
      const { lanes, skipped } = await buildLanes(config, only);
      for (const s of skipped) console.log(`lane ${s.id}: skipped (${s.reason})`);
      if (lanes.length === 0) {
        console.error('no lanes available — set API keys / enable providers in providers.json');
        process.exitCode = 1;
        await sql.end();
        return;
      }
      console.log(`dispatching with lanes: ${lanes.map(l => l.adapter.version).join(', ')}`);

      const ensembleScope = opts.ensemble ? {
        newMessagesSince: opts.newMessagesSince ? new Date(opts.newMessagesSince) : undefined,
        aliasesSince: opts.aliasesSince ? new Date(opts.aliasesSince) : undefined,
        retryDrains: opts.retryDrains || opts.drainsOnly,
        drainsOnly: opts.drainsOnly,
      } : undefined;
      if (ensembleScope) {
        console.log(`ensemble scope: messages >= ${ensembleScope.newMessagesSince?.toISOString() ?? 'n/a'}, aliases >= ${ensembleScope.aliasesSince?.toISOString() ?? 'n/a'}`);
      }
      const handle = runDispatcher(opts.chat, lanes, { limitMessages: opts.limit, batchSize: opts.batchSize, verbose: opts.verbose, ensembleScope });
      const stopMonitor = await startMonitor(opts.chat, handle, ensembleScope);
      // graceful shutdown: finish in-flight batches, store, exit; cache loses nothing
      const onSignal = () => {
        console.log('\nshutting down — letting in-flight batches finish…');
        handle.shutdown();
      };
      process.on('SIGINT', onSignal);
      process.on('SIGTERM', onSignal);

      await handle.done;
      stopMonitor();
      for (const { stats } of handle.lanes) {
        console.log(`[${stats.id}] ${stats.batchesDone} batches / ${stats.messagesDone} messages (${stats.repaired} repaired, ${stats.failedRetriable} failed-retriable, ${stats.drained} drained)${stats.lastError ? ` — last error: ${stats.lastError}` : ''}`);
      }
      await sql.end();
    });

  cmd.command('calibrate')
    .description('Run reference-classified messages through each lane; PASS/FAIL at daily-mean r >= 0.8')
    .requiredOption('--chat <slug>')
    .option('--sample <n>', 'messages to sample', v => parseInt(v, 10), DEFAULT_SAMPLE)
    .option('--reference <version>', 'model_version to treat as ground truth', DEFAULT_REFERENCE)
    .option('--providers <list>', 'comma-separated subset (mistral,gemini,cerebras,groq)')
    .option('--verbose')
    .action(async (opts: { chat: string; sample: number; reference: string; providers?: string; verbose?: boolean }) => {
      const only = opts.providers?.split(',').map(s => s.trim()) as ProviderId[] | undefined;
      const config = await loadProvidersConfig();
      const { lanes, skipped } = await buildLanes(config, only);
      for (const s of skipped) console.log(`lane ${s.id}: skipped (${s.reason})`);
      if (lanes.length === 0) {
        console.error('no lanes available — set API keys / enable providers in providers.json');
        process.exitCode = 1;
        await sql.end();
        return;
      }

      const samp = await fetchCalibrationSample(opts.chat, opts.reference, opts.sample);
      if (samp.inputs.length === 0) {
        console.error(`no cached reference results for model_version=${opts.reference}`);
        process.exitCode = 1;
        await sql.end();
        return;
      }
      console.log(`calibrating ${lanes.map(l => l.adapter.version).join(', ')} on ${samp.inputs.length} messages (${samp.reference.length} pairs)`);

      const results = [];
      for (const lane of lanes) {
        results.push(await calibrateLane(lane, samp, opts.verbose));
      }
      printCalibrationTable(results, samp.inputs.length, opts.reference);
      if (results.some(r => !r.pass)) process.exitCode = 1;
      await sql.end();
    });
  return cmd;
}
