import { Command } from 'commander';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { simulate, DEFAULT_OPTIONS } from '@/lib/synth/simulate';
import { writeChat, type GroundTruth } from '@/lib/synth/export';
import { loadSyntheticChat } from '@/lib/synth/load';
import {
  truthPairs, evaluateMentions, evaluateSentiment, loadMentions, loadSentiments,
  writeOracleSentiments, clearOracleSentiments, ORACLE_VERSION,
} from '@/lib/synth/eval';
import { sql } from '@/lib/db/client';

const DEFAULT_CHAT = 'binge-club';
const DEFAULT_DIR = path.join('..', 'data', 'synthetic', DEFAULT_CHAT);

async function readTruth(dir: string): Promise<GroundTruth> {
  return JSON.parse(await readFile(path.join(dir, 'ground_truth.json'), 'utf8')) as GroundTruth;
}

export function makeSynthCommand(): Command {
  const cmd = new Command('synth').description('Synthetic demo chat: generate, load, evaluate');

  cmd.command('generate')
    .description('Simulate a fictional group chat and write it as Instagram export archives + ground truth')
    .option('--seed <n>', 'PRNG seed (same seed → identical output)', v => parseInt(v, 10), DEFAULT_OPTIONS.seed)
    .option('--start <date>', 'first day, YYYY-MM-DD', DEFAULT_OPTIONS.start)
    .option('--days <n>', 'length of the season in days', v => parseInt(v, 10), DEFAULT_OPTIONS.days)
    .option('--sessions <n>', 'mean conversations per ordinary day', v => parseFloat(v), DEFAULT_OPTIONS.sessionsPerDay)
    .option('--out <dir>', 'output directory', DEFAULT_DIR)
    .action(async (opts: { seed: number; start: string; days: number; sessions: number; out: string }) => {
      const t0 = Date.now();
      const chat = simulate({ seed: opts.seed, start: opts.start, days: opts.days, sessionsPerDay: opts.sessions });
      const written = await writeChat(chat, opts.out);
      console.log(JSON.stringify({
        messages: chat.messages.length,
        mentionMessages: chat.messages.filter(m => m.intents.length).length,
        reactions: chat.messages.reduce((s, m) => s + m.reactions.length, 0),
        members: chat.cast.length,
        exports: written.exports.map(e => ({ dir: e.dir, files: e.files.length, messages: e.messages })),
        groundTruth: written.groundTruthFile,
        took_ms: Date.now() - t0,
      }, null, 2));
    });

  cmd.command('load')
    .description('Ingest the generated exports through the real pipeline, merge rename splits, seed curation')
    .option('--chat <slug>', 'chat slug', DEFAULT_CHAT)
    .option('--name <name>', 'chat display name', DEFAULT_OPTIONS.chatName)
    .option('--dir <dir>', 'generated chat directory', DEFAULT_DIR)
    .action(async (opts: { chat: string; name: string; dir: string }) => {
      await loadSyntheticChat(opts.chat, opts.name, opts.dir, s => console.log(JSON.stringify(s)));
      await sql.end();
    });

  cmd.command('oracle')
    .description(`DEV ONLY: fill sentiment from ground truth (model_version ${ORACLE_VERSION}) to exercise scoring without LLM keys`)
    .option('--chat <slug>', 'chat slug', DEFAULT_CHAT)
    .option('--dir <dir>', 'generated chat directory', DEFAULT_DIR)
    .option('--clear', 'delete oracle rows instead (do this before the real LLM dispatch)')
    .action(async (opts: { chat: string; dir: string; clear?: boolean }) => {
      if (opts.clear) {
        console.log(JSON.stringify({ deleted: await clearOracleSentiments(opts.chat) }));
      } else {
        const n = await writeOracleSentiments(opts.chat, truthPairs(await readTruth(opts.dir)));
        console.log(JSON.stringify({ written: n, model_version: ORACLE_VERSION }));
      }
      await sql.end();
    });

  cmd.command('eval')
    .description('Score mention resolution and every sentiment model_version against ground truth')
    .option('--chat <slug>', 'chat slug', DEFAULT_CHAT)
    .option('--dir <dir>', 'generated chat directory', DEFAULT_DIR)
    .option('--include-oracle', 'also score the dev-only oracle rows (a sanity check — should be ~100%)')
    .option('--report <file>', 'also write the JSON report to this file')
    .action(async (opts: { chat: string; dir: string; includeOracle?: boolean; report?: string }) => {
      const truth = truthPairs(await readTruth(opts.dir));
      const mentions = evaluateMentions(truth, await loadMentions(opts.chat));
      const sentiments = (await loadSentiments(opts.chat)).filter(r => opts.includeOracle || r.model !== ORACLE_VERSION);
      const report = { chat: opts.chat, mentions, sentiment: evaluateSentiment(truth, sentiments) };
      console.log(JSON.stringify(report, null, 2));
      if (opts.report) await writeFile(opts.report, JSON.stringify(report, null, 2));
      await sql.end();
    });

  return cmd;
}
