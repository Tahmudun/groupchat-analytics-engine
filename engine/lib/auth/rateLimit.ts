import { sql } from '@/lib/db/client';

/**
 * DB-backed login throttle so serverless instances share state. Only *failed*
 * attempts count — a burst of legitimate logins (the whole group chat pasting
 * the password at once) must never lock everyone out. Two buckets are checked
 * per attempt: the caller's IP (tight) and a global cap (loose, DoS backstop).
 */
export const FREE_ATTEMPTS_IP = 5;
export const FREE_ATTEMPTS_GLOBAL = 20;
export const WINDOW_SECONDS = 60;
const MAX_LOCK_MINUTES = 60;

export type RateVerdict = { ok: true } | { ok: false; retryAfterSeconds: number };

/** Read-only: is this key currently locked out? Called before verifying. */
async function checkLocked(key: string, now = new Date()): Promise<RateVerdict> {
  const [row] = await sql`SELECT locked_until FROM login_attempts WHERE key = ${key}`;
  const lockedUntil = row?.locked_until as Date | null | undefined;
  if (lockedUntil && lockedUntil > now) {
    return { ok: false, retryAfterSeconds: Math.ceil((lockedUntil.getTime() - now.getTime()) / 1000) };
  }
  return { ok: true };
}

/** Record one failed attempt against a key; sets an exponential lock once the
 *  free allowance in the current window is exceeded. */
async function recordFailure(key: string, freeAllowance: number, now = new Date()): Promise<void> {
  const [row] = await sql`
    INSERT INTO login_attempts (key, fail_count, first_fail_at)
    VALUES (${key}, 1, ${now})
    ON CONFLICT (key) DO UPDATE SET
      fail_count = CASE
        WHEN login_attempts.first_fail_at < ${now} - (${WINDOW_SECONDS} || ' seconds')::interval
             AND (login_attempts.locked_until IS NULL OR login_attempts.locked_until <= ${now})
          THEN 1
        ELSE login_attempts.fail_count + 1 END,
      first_fail_at = CASE
        WHEN login_attempts.first_fail_at < ${now} - (${WINDOW_SECONDS} || ' seconds')::interval
             AND (login_attempts.locked_until IS NULL OR login_attempts.locked_until <= ${now})
          THEN ${now}
        ELSE login_attempts.first_fail_at END
    RETURNING fail_count`;
  const failCount = row!.fail_count as number;
  if (failCount > freeAllowance) {
    const minutes = Math.min(2 ** (failCount - freeAllowance - 1), MAX_LOCK_MINUTES);
    await sql`UPDATE login_attempts SET locked_until = ${new Date(now.getTime() + minutes * 60_000)} WHERE key = ${key}`;
  }
}

/** Check both buckets before verifying a password. */
export async function checkLoginRate(ip: string): Promise<RateVerdict> {
  const perIp = await checkLocked(`ip:${ip}`);
  if (!perIp.ok) return perIp;
  return checkLocked('global');
}

/** Called after a wrong password — count it against both buckets. */
export async function recordFailedLogin(ip: string): Promise<void> {
  await recordFailure(`ip:${ip}`, FREE_ATTEMPTS_IP);
  await recordFailure('global', FREE_ATTEMPTS_GLOBAL);
}

/** Called after a correct password — clear the IP's failures (global untouched:
 *  a legitimate success shouldn't erase an in-progress global attack window). */
export async function clearAttempts(ip: string): Promise<void> {
  await sql`DELETE FROM login_attempts WHERE key = ${`ip:${ip}`}`;
}
