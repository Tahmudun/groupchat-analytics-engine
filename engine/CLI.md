# `pnpm wrapped` — command reference

All commands run from `engine/`. Every command supports `--help`.

GUI equivalent: the local admin page (`/admin`, see README) wraps ingest,
mention extraction, sentiment dispatch, scores, and alias management.

## migrate

Apply pending migrations from `supabase/migrations/` (tracked in
`engine_migrations`, each in its own transaction).

```bash
pnpm wrapped migrate            # apply everything pending
pnpm wrapped migrate --dry-run  # list pending without applying
```

Output: `Applied: <files>` or `No pending migrations.`

## db bootstrap

Create a working database from nothing: the base schema
(`search-engine/supabase/schema.sql`) when `messages` doesn't exist yet, then
every pending migration. Works on plain Postgres (local, Neon, a VPS) as well
as Supabase. Idempotent.

```bash
DATABASE_URL=postgresql://… pnpm wrapped db bootstrap
```

Output: `{baseSchemaApplied, migrationsApplied}`.

## ingest

Parse a chat export folder and load it. Idempotent — dedup by message id,
safe to re-run on overlapping exports. Auto-creates members (+ handle
aliases), marks zero-message members `removed`, refreshes `site_stats`,
runs `ANALYZE`.

```bash
pnpm wrapped ingest --chat=flix-original --dir=../data/flix/2026-04-29
pnpm wrapped ingest --chat=flix-original --dir=... --dry-run   # parse + count only
```

Output: JSON report — `parsed`, `inserted`, `deduped`, `reactionsInserted`,
`reactionsDeduped`, `membersUpserted`, `errors`, `took_ms`.

## aliases

```bash
pnpm wrapped aliases add --chat=flix-original --member=<username> --alias="the mayor" --type=nickname
pnpm wrapped aliases list --chat=flix-original [--member=<username>]
```

`--type`: `handle` | `real_name` | `nickname` | `roast`. Aliases power the
mention resolver; chat-specific noise words can be excluded via
`chats/<slug>/config.json` → `aliasBlocklist`.

## mentions extract

The resolver pass behind the admin "mentions" button, headless: scan real
messages, write `message_mentions` (idempotent via the unique key). No LLM.

```bash
pnpm wrapped mentions extract --chat=flix-original [--since=2026-07-01]
```

## members suggest / merge

The admin merge panel, headless. `suggest` lists likely rename-split pairs
(pg_trgm similarity on display names); `merge` folds sources into a canonical
member in one transaction (duplicates collapsed on `(timestamp_ms, content)`,
refs reassigned, the old name kept as an alias), then refreshes caches.

```bash
pnpm wrapped members suggest --chat=binge-club [--threshold=0.4]
pnpm wrapped members merge --chat=binge-club --into="Leo Martins ⚡" --from="Leo Martins 🦁" --dry-run
pnpm wrapped members merge --chat=binge-club --into="Leo Martins ⚡" --from="Leo Martins 🦁"
```

## sentiment run

Two phases: (1) extract mentions locally into `message_mentions`,
(2) LLM-classify mention messages (single engine: Groq primary, Ollama
fallback; 25 messages/call, cached by `model_version` — re-runs never
re-pay). The model returns compressed `[index, member, score]` triples;
labels derive client-side at ±0.15.

```bash
pnpm wrapped sentiment run --chat=flix-original                 # full run
pnpm wrapped sentiment run --chat=flix-original --limit=100     # capped (testing)
pnpm wrapped sentiment run --chat=flix-original --full-rerun    # reclassify stale cache
pnpm wrapped sentiment run --chat=flix-original --since=2026-04-01
pnpm wrapped sentiment run --chat=flix-original --batch-size=10
```

Output: JSON report — `scanned`, `mentionMessages`, `classified`, `cached`, `failed`.

## sentiment dispatch

Classify pending mentions through **all configured free-tier lanes in
parallel**: Mistral, Gemini (flash-lite picked from the live models list),
Cerebras (`gpt-oss-120b`, small batches for its 8k context), Groq
(`llama-3.1-8b-instant`). Per-lane RPM/TPM/daily budgets come from
`engine/providers.json` — fill the placeholders from each provider console.
Keys via env: `MISTRAL_API_KEY`, `GEMINI_API_KEY`, `CEREBRAS_API_KEY`,
`GROQ_API_KEY`; lanes without a key are skipped. Results cache under
`model_version = provider/model`, so lanes never redo each other's work
and Ctrl-C loses nothing. Messages mentioning ≥500-msg members go first.
Progress prints every 30s (per-lane batches, token budget, backoff state,
global ETA).

```bash
pnpm wrapped sentiment dispatch --chat=flix-original
pnpm wrapped sentiment dispatch --chat=flix-original --providers=mistral,gemini
pnpm wrapped sentiment dispatch --chat=flix-original --limit=100 --verbose

# Fill every selected model only for an affected incremental slice. Existing
# model/pair rows are reused independently; reruns resume exact missing work.
pnpm wrapped sentiment dispatch --chat=flix-original --ensemble \
  --new-messages-since=2026-07-02 --aliases-since=2026-07-08

# Retry only confidence-0 rows inside that same bounded scope.
pnpm wrapped sentiment dispatch --chat=flix-original --ensemble --retry-drains \
  --new-messages-since=2026-07-02 --aliases-since=2026-07-08
```

`--ensemble` deliberately requires at least one cutoff so it cannot
accidentally multiply the full historical workload. Its two scopes are
unioned: all mention targets in new messages, plus historical targets matched
through aliases created since the alias cutoff.

## sentiment calibrate

Replay ~250 messages already classified by the reference version
(default `v1-llama-3.3-70b`) through each lane and compare: per-pair
score correlation and per-member **daily-mean** correlation (what scoring
actually consumes). PASS at daily-mean r ≥ 0.8; exits 1 if any lane
fails. Nothing is stored — run this before a full dispatch and disable
failing lanes in `providers.json`.

```bash
pnpm wrapped sentiment calibrate --chat=flix-original
pnpm wrapped sentiment calibrate --chat=flix-original --sample=250 --providers=cerebras
```

Repair only existing confidence-0 cache markers without also queueing model
rows that were never classified:

```bash
pnpm wrapped sentiment dispatch --chat=flix-original --ensemble --drains-only --providers=groq,mistral --batch-size=1
```

## scores compute

Compute the daily member score time series (0–2000 index) into
`member_scores`. Processes month windows internally; upserts, so re-running
is safe. Constants + `SCORING_VERSION` in `lib/scoring/formula.ts`. Ends by
refreshing `weekly_stats`/`member_costars` and then chaining into
`recap compute` (see below) — a Recap failure is logged, not thrown, so it
never fails an otherwise-successful scores run.

```bash
pnpm wrapped scores compute --chat=flix-original
pnpm wrapped scores compute --chat=flix-original --from=2026-04-01 --to=2026-04-30
```

Output: `{days, rowsWritten}`.

## recap compute

Compute the precomputed "Recap" (Spotify-Wrapped-style) stat blob for every
eligible member into `member_recap`. One JSONB blob per member; upserts, so
re-running is safe. Runs automatically at the end of every `scores compute`
(see below), so this is mainly for a standalone re-run (e.g. after a Recap
code change bumps `STATS_VERSION`). Takes several minutes over the full chat.

```bash
pnpm wrapped recap compute --chat=flix-original
```

Output: `{members}`.

## synth (public demo data)

A fictional chat for the public demo, run through the real pipeline. Full
walkthrough: `docs/DEMO.md`.

```bash
pnpm wrapped synth generate [--seed=20260330] [--start=2026-03-30] [--days=182] [--out=../data/synthetic/binge-club]
pnpm wrapped synth load    [--chat=binge-club] [--dir=…]   # refuses a DB that holds a real chat
pnpm wrapped synth eval    [--chat=binge-club] [--report=eval.json]
pnpm wrapped synth oracle  [--clear]                        # DEV ONLY: ground-truth sentiment, no LLM keys
```

- `generate`: seeded simulation of 20 characters and 10 lurkers over a
  storyline, written as genuine Instagram archives (newest-first, latin-1
  mojibake, ASCII-escaped JSON). The two exports straddle a display-name
  change, so the real name-drift split reproduces. Also writes
  `ground_truth.json` (who each message is about, and the intent) and
  `cast.json`.
- `load`: each export through `ingest`, then the merge tool, then nickname
  aliases and show taglines.
- `eval`: mention precision/recall plus false-positive and false-negative
  aliases; per sentiment `model_version`: accuracy, macro-F1, MAE, confusion
  matrix, per-intent accuracy.

## search

Exercise the search pipeline from the terminal (same code path as
`POST /api/v1/chats/:slug/search/messages`).

```bash
pnpm wrapped search "pizza" --sort relevance --limit 5
pnpm wrapped search "pizza" --filter sender:kenji min_reactions:3 --sort most_reactions
```

Filters: `sender`, `media_type`, `has_media`, `min_reactions`, `date_from`,
`date_to`, `message_type`. Sorts: `newest` | `oldest` | `relevance` |
`most_reactions`.

## status

```bash
pnpm wrapped status --chat=flix-original
```

Text dashboard: applied migrations, message/member/alias counts, mention +
sentiment coverage, score freshness.

## API routes (for reference)

All under `/api/v1/`, bearer-token gated (`ENGINE_API_TOKEN`):

| Route | Purpose |
|---|---|
| `GET /health` | liveness (no auth) |
| `GET /chats` | list chats |
| `GET /chats/:slug` | chat metadata + counts |
| `GET /chats/:slug/members?include_inactive=true` | members + current score |
| `GET /chats/:slug/scores/current` | latest score per member |
| `GET /chats/:slug/scores/timeseries?window=7d\|30d\|90d\|365d\|all` | chart series |
| `POST /chats/:slug/search/messages` | search (body: `{query?, filters?, sort?, limit?, cursor?}`) |
