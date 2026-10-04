import { env } from '@/lib/env';

/** FLIX media (avatars/banners/posters) live in a private Supabase Storage
 *  bucket, served back through the gated /api/media route via signed reads. */
export const BUCKET = 'flix-media';
export const MEDIA_KINDS = ['avatar', 'banner', 'poster', 'tile'] as const;
export type MediaKind = (typeof MEDIA_KINDS)[number];

const MAX_BYTES = 5 * 1024 * 1024;
const EXT_BY_TYPE: Record<string, string> = {
  'image/png': 'png', 'image/jpeg': 'jpg', 'image/jpg': 'jpg',
  'image/webp': 'webp', 'image/gif': 'gif',
};
const ALLOWED_EXT = new Set(['png', 'jpg', 'jpeg', 'webp', 'gif']);

export function slugify(s: string): string {
  const slug = s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40).replace(/-+$/g, '');
  return slug || 'media';
}

export function extFor(filename: string, contentType: string): string {
  const fromName = filename.includes('.') ? filename.split('.').pop()!.toLowerCase() : '';
  const ext = ALLOWED_EXT.has(fromName) ? fromName : EXT_BY_TYPE[contentType.toLowerCase()];
  if (!ext) throw new Error(`unsupported image type (${filename}, ${contentType})`);
  return ext;
}

export function buildMediaPath(chat: string, kind: MediaKind, name: string, ext: string, now = Date.now()): string {
  return `${chat}/${kind}/${slugify(name)}-${now}.${ext}`;
}

/** Returns a rejection reason, or null if the upload is acceptable. */
export function validateMediaUpload(kind: string, contentType: string, size: number): string | null {
  if (!MEDIA_KINDS.includes(kind as MediaKind)) return `unknown kind '${kind}' (expected ${MEDIA_KINDS.join('/')})`;
  if (!contentType.startsWith('image/')) return 'file must be an image';
  if (size > MAX_BYTES) return 'image too large (max 5MB)';
  return null;
}

/** Max characters of an inline base64 image we'll store directly in a profile
 *  column (data: URIs bypass Supabase Storage entirely). Avatars are small
 *  thumbnails; banners are wide heroes, so they get a larger budget. The client
 *  resizer keeps uploads well under these. */
export const MAX_INLINE_IMAGE_CHARS: Record<MediaKind, number> = {
  avatar: 400_000,
  banner: 1_400_000,
  poster: 700_000,
  tile: 500_000, // login "Who's watching?" square — bigger than a pfp, smaller than a poster
};

/** Validate an image reference destined for a profile/entry column. Accepts
 *  null/empty (cleared), a plain storage path (legacy Supabase Storage), or a
 *  small inline base64 image data URI. Returns a rejection reason, or null. */
export function validateImageRef(value: string | null | undefined, kind: MediaKind): string | null {
  if (!value) return null;
  if (!value.startsWith('data:')) return null; // storage path — allowed as-is
  if (!/^data:image\/(png|jpeg|jpg|webp|gif);base64,/i.test(value)) {
    return 'inline image must be a base64 PNG, JPEG, WebP, or GIF';
  }
  const cap = MAX_INLINE_IMAGE_CHARS[kind];
  if (value.length > cap) return `inline ${kind} image too large (max ~${Math.round(cap / 1000)}KB encoded)`;
  return null;
}

function storageBase(): { url: string; headers: Record<string, string> } {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_KEY) {
    throw new Error('media storage not configured (set SUPABASE_URL and SUPABASE_SERVICE_KEY)');
  }
  // New-format keys (sb_secret_…) are routed by the `apikey` header only —
  // the gateway's JWT plugin rejects them as "Invalid Compact JWS" if they
  // also appear as a Bearer token. Legacy JWT service keys want both.
  const key = env.SUPABASE_SERVICE_KEY;
  const isJwt = key.startsWith('eyJ');
  const headers: Record<string, string> = isJwt
    ? { apikey: key, authorization: `Bearer ${key}` }
    : { apikey: key };
  return { url: env.SUPABASE_URL.replace(/\/$/, ''), headers };
}

/** A storage 4xx from Kong's JWT plugin means the configured key isn't a JWT
 *  this project's Storage gateway accepts — surface an actionable hint. */
function storageHint(status: number, text: string): string {
  if (/Compact JWS|required property 'authorization'/i.test(text)) {
    return `${status}: this Supabase project's Storage API needs a legacy JWT service_role key. ` +
      `Set SUPABASE_SERVICE_KEY to the JWT-format key (dashboard → Project Settings → API keys → legacy keys). ` +
      `Until then, use the keyart presets instead of image uploads. [${text}]`;
  }
  return `${status} ${text}`;
}

/** Idempotently create the private bucket (409 = already exists → fine). */
export async function ensureBucket(): Promise<void> {
  const { url, headers } = storageBase();
  const res = await fetch(`${url}/storage/v1/bucket`, {
    method: 'POST',
    headers: { ...headers, 'content-type': 'application/json' },
    body: JSON.stringify({ id: BUCKET, name: BUCKET, public: false }),
  });
  if (!res.ok && res.status !== 409) {
    throw new Error(`could not create storage bucket: ${storageHint(res.status, await res.text())}`);
  }
}

export async function putObject(path: string, bytes: Buffer | Uint8Array, contentType: string): Promise<void> {
  const { url, headers } = storageBase();
  const res = await fetch(`${url}/storage/v1/object/${BUCKET}/${path}`, {
    method: 'POST',
    headers: { ...headers, 'content-type': contentType, 'x-upsert': 'true' },
    body: bytes as unknown as BodyInit,
  });
  if (!res.ok) throw new Error(`upload failed: ${storageHint(res.status, await res.text())}`);
}

/** Fetch an object's bytes (private bucket, service-key auth). */
export async function getObject(path: string): Promise<{ body: ArrayBuffer; contentType: string } | null> {
  const { url, headers } = storageBase();
  const res = await fetch(`${url}/storage/v1/object/${BUCKET}/${path}`, {
    headers,
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`download failed: ${res.status}`);
  return { body: await res.arrayBuffer(), contentType: res.headers.get('content-type') ?? 'application/octet-stream' };
}
