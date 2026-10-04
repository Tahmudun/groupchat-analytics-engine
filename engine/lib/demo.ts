/**
 * Public demo mode (DEMO_MODE=true): the site runs openly, read-only, on a
 * synthetic chat (see lib/synth) — no password, no admin, a "fictional data"
 * badge on every page.
 *
 * Edge-safe on purpose (no Node or DB imports): middleware reads these too.
 * The database-backed half of the safety check lives in instrumentation.ts.
 */

export const DEMO_MODE = process.env.DEMO_MODE === 'true';

/** Optional link from the demo badge/intro to the public source. */
export const DEMO_REPO_URL = process.env.DEMO_REPO_URL || null;

/** Set when a visitor clicks through the demo intro; first visits to / start at the intro instead. */
export const DEMO_ENTERED_COOKIE = 'flix_demo_entered';

/**
 * Demo mode publishes everything it renders, so it must only ever render a
 * chat flagged synthetic. Returns the reason to refuse, or null when safe.
 * Pure so it's unit-testable; instrumentation.ts feeds it the chats row.
 */
export function demoRefusal(chatId: string, row: { is_synthetic: boolean } | undefined): string | null {
  if (!row) return `DEMO_MODE refused: chat '${chatId}' does not exist in this database`;
  if (!row.is_synthetic) {
    return `DEMO_MODE refused: chat '${chatId}' is not synthetic — demo mode publishes everything it shows, so it only runs on generated data (pnpm wrapped synth load)`;
  }
  return null;
}

export function isAdminPath(pathname: string): boolean {
  return pathname.startsWith('/admin') || pathname.startsWith('/api/admin');
}
