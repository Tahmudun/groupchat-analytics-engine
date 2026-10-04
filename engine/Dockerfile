# syntax=docker/dockerfile:1
#
# Built on the target box (arm64). Two useful targets:
#   runner — the Next.js server the site containers run
#   tools  — full deps + tsx, for `pnpm wrapped migrate|ingest|sentiment|...`

FROM node:22-bookworm-slim AS base
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@11.9.0 --activate

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
# A dummy URL satisfies lib/env.ts at build time; nothing connects during build.
RUN DATABASE_URL=postgres://build:build@localhost:5432/build pnpm build

# CLI/pipeline runner: needs source + tsx, so it keeps full node_modules.
FROM base AS tools
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Ingest target, shared with the app containers via the `appdata` volume so an
# export uploaded through /admin is the same file the CLI ingests. lib/admin/
# upload.ts resolves cwd/../data, i.e. /data.
RUN mkdir -p /data
CMD ["pnpm", "wrapped", "--help"]

FROM base AS runner
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
RUN groupadd --system --gid 1001 nodejs \
 && useradd --system --uid 1001 --gid nodejs nextjs
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
# Migrations ship with the image so a container can bootstrap its own database.
COPY --from=builder --chown=nextjs:nodejs /app/supabase/migrations ./supabase/migrations
# Next's file tracer already pulls these into .next/standalone, but nothing
# pins that: it is a heuristic a Next upgrade can change. Copy them
# explicitly, because the failure is silent -- lib/config/load.ts falls back
# to `{ slug }` on ENOENT, which empties aliasBlocklist and lets junk mention
# rows flow into sentiment -> scores -> recap with no error. Cheap insurance
# against a quiet data-corrupting regression.
COPY --from=builder --chown=nextjs:nodejs /app/chats ./chats
COPY --from=builder --chown=nextjs:nodejs /app/providers.json ./providers.json
# Admin export uploads land in cwd/../data (lib/admin/upload.ts) = /data.
# Created here and owned by the runtime uid so the `appdata` volume inherits
# that ownership on first mount -- without this the container runs as 1001
# against a root-owned mountpoint and every upload fails with EACCES.
RUN mkdir -p /data && chown nextjs:nodejs /data
USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]
