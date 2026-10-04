/**
 * Runs the parity gate across two databases.
 *
 * Usage:
 *   SOURCE_DATABASE_URL=... TARGET_DATABASE_URL=... pnpm verify:parity
 *
 * Exits non-zero on any difference. Run BEFORE announcing the new URL.
 */
import postgres from 'postgres';
import { PARITY_TABLES, buildChecksumQuery, compareParity, type ParityResult } from '@/lib/migration/parity';

async function collect(url: string, label: string): Promise<ParityResult[]> {
  const db = postgres(url, { max: 1, prepare: false, idle_timeout: 10, connect_timeout: 60 });
  const out: ParityResult[] = [];
  try {
    // Full-table scans on a metered source: give them room.
    await db.unsafe(`SET statement_timeout = '30min'`);
    // Pin session settings that change how checksummed columns render as
    // text — a real mismatch between the two hosts here would make a
    // byte-identical restore *fail* the gate. Do not remove these as
    // "redundant": nothing else in this script sets them, and Supabase vs a
    // freshly provisioned postgres:17 are not guaranteed to share defaults.
    //   - DateStyle: governs `date`::text (member_scores.date). Pinned to
    //     Postgres's own factory default so 'YYYY-MM-DD' is guaranteed on
    //     both sides regardless of what either server's postgresql.conf sets.
    //   - extra_float_digits: governs `real`::text (mention_sentiments.
    //     sentiment_score/confidence, member_scores.score, and the
    //     member_profiles focus_x/focus_y/zoom crop columns) — the
    //     documented Postgres float-serialization gotcha where a lower
    //     setting can print fewer digits than the value needs to round-trip.
    //     Set to 3, the max, for exact and consistent output on both hosts.
    //   - TimeZone is deliberately NOT pinned: no column in PARITY_TABLES is
    //     timestamptz (the audit timestamp columns — created_at/updated_at/
    //     computed_at — are excluded from every spec because a restore
    //     legitimately gives them a new wall-clock value). Add it here if a
    //     future PARITY_TABLES entry ever checksums a timestamptz column.
    await db.unsafe(`SET DateStyle = 'ISO, MDY'`);
    await db.unsafe(`SET extra_float_digits = 3`);
    for (const spec of PARITY_TABLES) {
      const [row] = await db.unsafe(buildChecksumQuery(spec));
      out.push({ table: spec.table, n: Number(row!.n), checksum: String(row!.checksum) });
      console.log(`  ${label} ${spec.table}: ${row!.n} rows, ${String(row!.checksum).slice(0, 12)}`);
    }
  } finally {
    await db.end();
  }
  return out;
}

async function main() {
  const src = process.env.SOURCE_DATABASE_URL;
  const tgt = process.env.TARGET_DATABASE_URL;
  if (!src || !tgt) throw new Error('SOURCE_DATABASE_URL and TARGET_DATABASE_URL are both required');

  console.log('reading source...');
  const source = await collect(src, 'src');
  console.log('reading target...');
  const target = await collect(tgt, 'tgt');

  const diffs = compareParity(source, target);
  if (diffs.length === 0) {
    console.log(`\nPARITY OK — ${source.length} tables identical`);
    process.exit(0);
  }
  console.error(`\n${diffs.length} PARITY FAILURE(S):`);
  for (const d of diffs) {
    console.error(`  ${d.table}: ${d.reason} (source ${d.source?.n} / target ${d.target?.n ?? 'absent'})`);
  }
  process.exit(1);
}

main().catch(e => { console.error(e); process.exit(1); });
