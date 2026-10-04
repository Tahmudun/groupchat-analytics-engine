import { z } from 'zod';
import dotenv from 'dotenv';
import path from 'node:path';

// CLI processes need .env loaded manually; Next.js loads engine/.env itself.
// Load engine/.env first, then the repo root .env as fallback (it holds
// SUPABASE_DB_URL and GROQ_API_KEY already).
dotenv.config({ path: path.join(process.cwd(), '.env') });
dotenv.config({ path: path.join(process.cwd(), '..', '.env') });

/**
 * A configured password gate must be a whole argon2 hash. Checked because the
 * way this breaks is silent and very hard to diagnose: Docker Compose
 * interpolates `$` in deploy/.env, and an argon2id digest is full of them
 * ($argon2id$v=19$m=...$salt$hash), so an unescaped value arrives truncated to
 * the fragment after the last `$` it recognised. The login route calls
 * `verify(...).catch(() => false)`, so a mangled hash does not error -- it just
 * answers "Incorrect password." to every correct password, forever, with
 * nothing in any log. Rejecting it here turns that silent lockout into an
 * obvious, named misconfiguration.
 *
 * Note where this actually surfaces: Next imports this module lazily, so the
 * container still STARTS. Every request that touches env then throws, the
 * message below lands in the container log, and the compose healthcheck marks
 * app-real unhealthy within about a minute (measured). That is the signal --
 * not a boot crash.
 */
const PasswordHash = z.string().min(1).refine(v => v.startsWith('$argon2'), {
  message:
    "must be a complete argon2id hash beginning with '$argon2'. If it looks " +
    "truncated, Docker Compose consumed the '$' characters: escape every '$' " +
    "as '$$' in deploy/.env (`pnpm wrapped hash-password` prints a " +
    'ready-to-paste line)',
});

const EnvSchema = z.object({
  DATABASE_URL: z.string().min(1),
  GROQ_API_KEY: z.string().min(1).optional(),
  MISTRAL_API_KEY: z.string().min(1).optional(),
  GEMINI_API_KEY: z.string().min(1).optional(),
  CEREBRAS_API_KEY: z.string().min(1).optional(),
  OLLAMA_URL: z.string().url().default('http://localhost:11434'),
  SENTIMENT_ENGINE: z.enum(['groq', 'ollama', 'auto']).default('auto'),
  ENGINE_API_TOKEN: z.string().min(1).optional(),
  ADMIN_ENABLED: z.enum(['true', 'false']).default('false'),
  // FLIX site gates (all optional: unset = site open, local-dev behaviour).
  SITE_PASSWORD_HASH: PasswordHash.optional(),
  ADMIN_PASSWORD_HASH: PasswordHash.optional(),
  SESSION_SECRET: z.string().min(1).optional(),
  // Supabase Storage for FLIX media (avatars/banners/posters).
  SUPABASE_URL: z.string().url().optional(),
  SUPABASE_SERVICE_KEY: z.string().min(1).optional(),
});

export type Env = z.infer<typeof EnvSchema>;

/**
 * An env var set to the empty string means "not configured", not "configured
 * as empty". Docker Compose has no way to conditionally omit a key: the map
 * form `GROQ_API_KEY: ${GROQ_API_KEY:-}` always sets the variable, empty when
 * the operator hasn't filled it in. Without this, every optional key above is
 * `.min(1)` and the whole container would refuse to boot with "Invalid
 * environment" over a provider the operator deliberately left unset.
 */
function dropEmpty(source: Record<string, string | undefined>): Record<string, string | undefined> {
  const out: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(source)) {
    if (typeof v === 'string' && v.trim() === '') continue;
    out[k] = v;
  }
  return out;
}

export function loadEnv(rawSource: Record<string, string | undefined> = process.env): Env {
  const source = dropEmpty(rawSource);
  const merged = { ...source, DATABASE_URL: source.DATABASE_URL ?? source.SUPABASE_DB_URL };
  const parsed = EnvSchema.safeParse(merged);
  if (!parsed.success) {
    throw new Error(`Invalid environment: ${parsed.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; ')} (is DATABASE_URL or SUPABASE_DB_URL set?)`);
  }
  return parsed.data;
}

export const env: Env = loadEnv();
