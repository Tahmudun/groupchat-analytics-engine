export function fmtInt(n: number): string {
  return Math.round(n).toLocaleString('en-US');
}

/** 12,345 → "12.3k" — poster captions need to stay short. */
export function fmtCompact(n: number): string {
  if (Math.abs(n) >= 1000) return `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k`;
  return fmtInt(n);
}

export function fmtDate(d: string | Date): string {
  const date = d instanceof Date ? d : new Date(d);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function fmtTime(d: string | Date): string {
  const date = d instanceof Date ? d : new Date(d);
  return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

/**
 * Symmetric percent change, bounded to ±200% — meaningful even when last
 * week's value was ~0 (a plain (new-old)/old ratio explodes to millions of
 * percent off a near-zero base). 0→X reads +200%, X→0 reads -200%.
 */
export function deltaFraction(current: number, previous: number): number {
  const denom = (Math.abs(current) + Math.abs(previous)) / 2;
  return denom === 0 ? 0 : (current - previous) / denom;
}

/** Signed percent badge text: 0.34 → "▲ 34%", -0.052 → "▼ 5%". */
export function fmtDelta(frac: number): string {
  return `${frac >= 0 ? '▲' : '▼'} ${Math.round(Math.abs(frac) * 100)}%`;
}

/** A stored media reference → a usable URL. Inline images (data: URIs, stored
 *  directly in member_profiles) pass through as-is; a storage path is routed to
 *  the gated stream. Null passes through. */
export function mediaUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  if (path.startsWith('data:')) return path;
  return `/api/media/${path.split('/').map(encodeURIComponent).join('/')}`;
}

export function initials(name: string): string {
  return (name.trim()[0] ?? '?').toUpperCase();
}
