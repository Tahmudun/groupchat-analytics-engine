# Groupchat Wrapped — Engine

The backend engine for Groupchat Wrapped, and — since the FLIX build
(2026-07-07) — the **whole site**: a Netflix-themed frontend where members are
shows and messages are episodes. Multi-tenant analytics over group chat
archives (Instagram today; WhatsApp/Discord/Messenger via the adapter pattern
later). Full spec: `../docs/gc-dossier-fable5-prompt.md` (old working title "GC
Dossier"); FLIX site spec + plan under `../docs/superpowers/`.

**Site pages** (`app/(site)/`, gated by `middleware.ts` when auth env is set):
`/` home (billboard + Flix Market + category rows), `/member/[username]` show
pages, `/search` (as-you-type + moment player), `/duos`, `/rewind`, `/login`.
`/admin` is the FLIX-reskinned operator console (upload, pipeline with live
progress, Shows editor, custom categories, members). JSON APIs stay under
`/api/v1/*` (bearer) and `/api/flix/*` + `/api/admin/*` (session-gated).

**The existing data is sacred.** This engine connects to the same Supabase
project as `../search-engine/` and its 672k+ ingested messages. Migrations
are strictly additive — never drop, alter, or rename an existing table.

## Prerequisites

- Node.js 20+ and pnpm
- A Groq API key (free tier) — recommended for sentiment
- Ollama running locally (`brew services start ollama`) with `gemma2:2b`
  pulled — the no-cloud fallback

## Setup

```bash
pnpm install
cp .env.example .env   # then fill in:
```

- `DATABASE_URL` — copy `SUPABASE_DB_URL` from the repo root `.env`
  (if unset, the engine falls back to the root `.env` automatically)
- `GROQ_API_KEY` — from the root `.env`
- `ENGINE_API_TOKEN` — any long random string; every `/api/v1/*` route
  requires it as `Authorization: Bearer <token>`

### FLIX site gates (optional — unset = site fully open, for local dev)

- `SESSION_SECRET` — random 32+ char string; signs session cookies (HMAC).
- `SITE_PASSWORD_HASH` — argon2id hash of the shared friends password. When set
  (with `SESSION_SECRET`), every page/route except `/login` needs a valid
  `flix_session` cookie.
- `ADMIN_PASSWORD_HASH` — argon2id hash of the admin password. When set, `/admin`
  + `/api/admin/*` additionally need a valid `flix_admin` cookie (this replaces
  the `ADMIN_ENABLED` escape hatch on deployed instances).
- `SUPABASE_URL`, `SUPABASE_SERVICE_KEY` — from the repo root `.env`; used for
  FLIX media storage (avatars/banners/posters in the private `flix-media` bucket).

Generate the hashes with `pnpm wrapped hash-password '<password>'` and paste the
output into the env vars. Rotating a password = change the env var; existing
sessions stay valid until they expire (30 days site / 24 h admin).

## Golden path

```bash
pnpm wrapped migrate                                          # apply engine migrations
pnpm wrapped ingest --chat=flix-original --dir=../data/flix/<date>
pnpm wrapped sentiment run --chat=flix-original --limit=100   # drop --limit for the full run
pnpm wrapped scores compute --chat=flix-original
pnpm wrapped status --chat=flix-original                      # text dashboard
pnpm dev                                                      # API on :3000
```

Then:

```bash
curl -s http://localhost:3000/api/v1/chats \
  -H "Authorization: Bearer $ENGINE_API_TOKEN"
```

Every endpoint returns `{data, meta}`; errors return
`{error: {code, message}}` with a proper status. See `CLI.md` for the full
command reference.

## Admin page (local-only)

`pnpm dev`, then open <http://localhost:3000/admin>. Requires `ADMIN_ENABLED=true`
in `engine/.env`; without it every `/api/admin/*` route (and the page's data) 404s.
Never deploy with the flag set — the admin surface has no auth by design.

- **Upload**: drop `message_*.json` files (or one export zip). Files are stored
  under `data/<chat>/YYYY-MM-DD/` (`data/flix/` for flix-original) and ingested
  through the same idempotent pipeline as `pnpm wrapped ingest` — re-uploading
  an old export inserts 0 rows. The route returns as soon as validation and the
  file writes finish; ingest then runs as a background job (same one-at-a-time
  registry as the pipeline steps) with live progress the page polls every second.
  An upload attempted while any job is running is rejected with 409 *before* any
  file is written. The progress percent is an estimate (bytes ÷ 420 bytes/message,
  calibrated on the real exports) clamped at 99% until the job completes; the
  parsed/new counts next to the bar are exact.
- **Pipeline**: buttons for mention extraction, sentiment dispatch, score
  recompute, and Recap recompute. One job at a time, in-process; the page
  polls coverage while it runs. Killing the dev server mid-sentiment loses
  nothing (results are cached per batch). Sentiment chains into scores on
  completion, and scores chains into Recap (`member_recap`, powers the
  member-page "▶ Recap" story) — so running sentiment alone brings the whole
  site current with no extra button press. The Recap tail of a scores run has
  no progress signal of its own (console-logged only) and a Recap failure
  never fails the scores job, since scores/weekly_stats already committed by
  that point — press the Recap button directly to see its own live progress
  or to retry just that stage.
- **Members / aliases**: searchable member table; expand a row to add or delete
  aliases (stored lowercase in `member_aliases`). New aliases apply to *future*
  mention extraction — press "Run mentions" to re-scan existing messages.
  Deleting an alias stops future matches but does not remove mentions already
  extracted with it. Entering a resolver stopword or a chat-config blocklisted
  word still stores the alias but returns a warning that it will never match
  as a mention.

## Conventions

- Migrations live in `supabase/migrations/NNN_name.sql`, applied in order by
  `pnpm wrapped migrate`, tracked in the `engine_migrations` table. Never
  edit an applied migration — add a new one.
- Ingestion is idempotent: re-running the same export inserts 0 rows.
  Message ids are the legacy MD5 formula from `search-engine/backend/parser.py`
  so new exports dedup against pre-engine rows.
- Per-chat knobs (alias blocklist, future scoring overrides) live in
  `chats/<slug>/config.json`, validated by Zod.
- Scoring constants live in `lib/scoring/formula.ts`. Tune, bump
  `SCORING_VERSION`, re-run `wrapped scores compute`.
- Run tests with `pnpm test`, types with `pnpm typecheck`.
