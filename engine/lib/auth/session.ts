/**
 * Signed session tokens for the two FLIX gates. Format:
 *   "<kind>.<expiryEpochSeconds>.<base64url HMAC-SHA256>"
 * Web Crypto only — this module runs in Next.js edge middleware as well as
 * node route handlers. Password verification (argon2id) lives in the login
 * route, never here: middleware only needs to check cookie validity.
 */

export type SessionKind = 'site' | 'admin';

export const COOKIE_NAMES: Record<SessionKind, string> = {
  site: 'flix_session',
  admin: 'flix_admin',
};

export const MAX_AGE_SECONDS: Record<SessionKind, number> = {
  site: 30 * 24 * 3600, // friends stay signed in for a month
  admin: 24 * 3600,     // admin re-enters daily
};

/** base64url without Buffer — the edge runtime only guarantees btoa. */
function b64url(bytes: ArrayBuffer): string {
  let bin = '';
  for (const b of new Uint8Array(bytes)) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function sign(secret: string, payload: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  return b64url(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload)));
}

export async function createToken(kind: SessionKind, secret: string, now = Date.now()): Promise<string> {
  const exp = Math.floor(now / 1000) + MAX_AGE_SECONDS[kind];
  const payload = `${kind}.${exp}`;
  return `${payload}.${await sign(secret, payload)}`;
}

export async function verifyToken(
  token: string | undefined | null,
  kind: SessionKind,
  secret: string,
  now = Date.now(),
): Promise<boolean> {
  if (!token) return false;
  const parts = token.split('.');
  if (parts.length !== 3) return false;
  const [tokenKind, expRaw, sig] = parts as [string, string, string];
  const exp = Number(expRaw);
  if (tokenKind !== kind || !Number.isFinite(exp)) return false;
  const expected = await sign(secret, `${tokenKind}.${expRaw}`);
  // Same-length string comparison of two HMACs; an attacker can't control
  // `expected`, so timing leaks nothing useful here.
  if (sig.length !== expected.length || sig !== expected) return false;
  return exp * 1000 > now;
}
