import { Command } from 'commander';
import { sql } from '@/lib/db/client';
import { SCORING_VERSION } from '@/lib/scoring/formula';

export function makeStatusCommand(): Command {
  return new Command('status')
    .description('Text dashboard: counts + last-computed timestamps per subsystem')
    .requiredOption('--chat <slug>')
    .action(async (opts: { chat: string }) => {
      const c = opts.chat;
      const one = async (q: Promise<Array<Record<string, unknown>>>) => (await q)[0] ?? {};
      const msgs = await one(sql`
        SELECT COALESCE(sum(messages_all_time), 0)::int AS total,
               max(last_active_at) AS newest
        FROM weekly_stats WHERE chat_id = ${c}`);
      const members = await one(sql`SELECT count(*)::int AS total FROM members WHERE chat_id = ${c} AND status <> 'removed'`);
      const aliases = await one(sql`SELECT count(*)::int AS total FROM member_aliases WHERE chat_id = ${c}`);
      const mentions = await one(sql`SELECT count(*)::int AS total, count(DISTINCT message_id)::int AS msgs FROM message_mentions WHERE chat_id = ${c}`);
      const sentiments = await one(sql`SELECT count(*)::int AS total, max(computed_at) AS last FROM mention_sentiments WHERE chat_id = ${c}`);
      const sentimentVersions = await sql`SELECT model_version, count(*)::int AS n FROM mention_sentiments WHERE chat_id = ${c} GROUP BY model_version ORDER BY n DESC`;
      const scores = await one(sql`SELECT count(*)::int AS total, max(date) AS last_day, max(computed_at) AS last FROM member_scores WHERE chat_id = ${c} AND scoring_version = ${SCORING_VERSION}`);
      const migrations = await one(sql`SELECT count(*)::int AS total, max(filename) AS latest FROM engine_migrations`);

      console.log(`── wrapped status: ${c} ──`);
      console.log(`migrations   ${migrations.total} applied (latest: ${migrations.latest})`);
      console.log(`messages     ${msgs.total} real (newest: ${msgs.newest})`);
      console.log(`members      ${members.total} active, ${aliases.total} aliases`);
      console.log(`mentions     ${mentions.total} across ${mentions.msgs} messages`);
      const versionSummary = sentimentVersions.map(v => `${v.model_version}: ${v.n}`).join(', ') || 'none';
      console.log(`sentiments   ${sentiments.total} (${versionSummary}) (last: ${sentiments.last ?? 'never'})`);
      console.log(`scores       ${scores.total} rows @ v${SCORING_VERSION} through ${scores.last_day ?? 'never'} (last: ${scores.last ?? 'never'})`);
      await sql.end();
    });
}
