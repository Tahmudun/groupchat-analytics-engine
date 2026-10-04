/**
 * Pre-publication gate for the public repo snapshot (scripts/public-snapshot.sh).
 *
 * Reads every member username, alias and bio name from the database at run
 * time and searches a directory for them, case-insensitively and as whole
 * words. Point DATABASE_URL at the REAL database: the names are never written
 * anywhere — only file:line hits are printed.
 *
 *   cd engine && pnpm exec tsx scripts/privacy-scan.ts --dir ../../public-snapshot
 *   … --allow maya,leo        # reviewed false positives (e.g. the synthetic cast's first names)
 *
 * "Distinctive" terms (digits, underscores, emoji/punctuation, or 6+ letters)
 * are what identify a person; a hit on one fails the scan. Short plain words
 * are listed for review but don't fail it — a member literally named "Blue"
 * will always collide with ordinary code.
 */
import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { sql } from '@/lib/db/client';
import { STOPWORDS } from '@/lib/mentions/stopwords';

const TEXT_EXT = /\.(ts|tsx|js|mjs|cjs|json|md|sql|py|css|html|txt|toml|ya?ml|example)$/i;
const SKIP_DIRS = new Set(['node_modules', '.next', '.git']);

function argValue(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function* walk(dir: string): AsyncGenerator<string> {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else if (TEXT_EXT.test(entry.name) || entry.name.startsWith('.')) yield full;
  }
}

const stripped = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const distinctive = (raw: string) => /[0-9_]/.test(raw) || /[^\p{L}\s]/u.test(raw) || stripped(raw).replace(/ /g, '').length >= 6;

async function main(): Promise<void> {
  const dir = argValue('--dir');
  if (!dir || !(await stat(dir).catch(() => null))?.isDirectory()) {
    console.error('usage: privacy-scan.ts --dir <snapshot directory> [--allow a,b,c]');
    process.exit(2);
  }
  const allow = new Set((argValue('--allow') ?? '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean));

  const rows = await sql`
    SELECT username AS term FROM members
    UNION SELECT alias FROM member_aliases
    UNION SELECT bio_name FROM members WHERE bio_name IS NOT NULL
    UNION SELECT unnest(aliases) FROM members WHERE aliases IS NOT NULL`;
  await sql.end();

  // every name as typed, plus its stripped form ('Casper 😨' → also 'casper')
  const terms = new Map<string, boolean>(); // lowercased term → distinctive?
  for (const r of rows) {
    const raw = String(r.term ?? '').trim();
    if (!raw) continue;
    for (const t of new Set([raw.toLowerCase(), stripped(raw)])) {
      if (t.length < 4 || STOPWORDS.has(t) || allow.has(t)) continue;
      terms.set(t, (terms.get(t) ?? false) || distinctive(raw));
    }
  }

  const patterns = [...terms.entries()].map(([t, d]) => ({
    term: t, distinctive: d, re: new RegExp(`(^|[^\\p{L}\\p{N}_])${escape(t)}($|[^\\p{L}\\p{N}_])`, 'iu'),
  }));
  const hits: Array<{ term: string; distinctive: boolean; where: string }> = [];
  for await (const file of walk(dir)) {
    const lines = (await readFile(file, 'utf8')).split('\n');
    lines.forEach((line, i) => {
      for (const p of patterns) if (p.re.test(line)) hits.push({ term: p.term, distinctive: p.distinctive, where: `${path.relative(dir, file)}:${i + 1}` });
    });
  }

  const byTerm = new Map<string, { distinctive: boolean; where: string[] }>();
  for (const h of hits) {
    const e = byTerm.get(h.term) ?? { distinctive: h.distinctive, where: [] };
    e.where.push(h.where);
    byTerm.set(h.term, e);
  }
  const report = (label: string, entries: Array<[string, { where: string[] }]>) => {
    if (!entries.length) return;
    console.log(`\n${label}`);
    for (const [, e] of entries) console.log(`  [${e.where.length} hit(s)] ${e.where.slice(0, 6).join(', ')}${e.where.length > 6 ? ' …' : ''}`);
  };
  const strong = [...byTerm.entries()].filter(([, e]) => e.distinctive);
  const weak = [...byTerm.entries()].filter(([, e]) => !e.distinctive);
  console.log(`scanned ${dir} against ${terms.size} name terms from the database`);
  // the matched term itself is deliberately not printed — open the file to review
  report('DISTINCTIVE name matches (fail):', strong);
  report('short/plain-word matches (review, do not fail):', weak);
  if (strong.length) {
    console.log(`\nFAIL: ${strong.length} distinctive term(s) found. Scrub them, or pass reviewed false positives via --allow.`);
    process.exit(1);
  }
  console.log('\nPASS: no distinctive member names found.');
}

main().catch(err => { console.error(err); process.exit(1); });
