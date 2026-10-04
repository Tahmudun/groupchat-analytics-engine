export type JobProgressView =
  | { kind?: 'ingest'; phase: 'parsing' | 'finalizing'; parsed: number; inserted: number; estimatedTotal?: number }
  | { kind: 'pipeline'; done: number; total: number | null; label: string };

export type JobView = {
  step: string;
  state: 'running' | 'done' | 'error';
  startedAt: string;
  finishedAt?: string;
  result?: unknown;
  error?: string;
  progress?: JobProgressView;
} | null;

export type StatusView = {
  chats: Array<{ id: string }>;
  coverage: {
    messages: number;
    newestMessage: string | null;
    activeMembers: number;
    aliasCount: number;
    mentions: number;
    mentionMessages: number;
    sentiments: number;
    sentimentsLast: string | null;
    sentimentVersions: Array<{ model_version: string; n: number }>;
    scoreRows: number;
    lastScoreDay: string | null;
    scoresLast: string | null;
  };
  job: JobView;
};

export async function apiJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const body = (await res.json().catch(() => null)) as { data?: T; error?: { message: string } } | null;
  if (!res.ok || !body || body.error) throw new Error(body?.error?.message ?? `${res.status} ${res.statusText}`);
  return body.data as T;
}

export type ProfileRow = {
  username: string;
  display_name: string;
  message_count: number;
  avatar_url: string | null;
  tile_url: string | null;
  banner_url: string | null;
  banner_preset: string | null;
  banner_focus_x: number | null;
  banner_focus_y: number | null;
  banner_zoom: number | null;
  poster_focus_x: number | null;
  poster_focus_y: number | null;
  poster_zoom: number | null;
  card_url: string | null;
  hero_desktop_url: string | null;
  hero_mobile_url: string | null;
  card_fit: string | null;
  hero_desktop_fit: string | null;
  hero_mobile_fit: string | null;
  hero_mobile_focus_x: number | null;
  hero_mobile_focus_y: number | null;
  hero_mobile_zoom: number | null;
  tagline: string | null;
  description: string | null;
  pinned: boolean | null;
  hidden: boolean | null;
  profile_source_username: string | null;
};

export type CategoryEntry = {
  id: number;
  title: string;
  subtitle: string | null;
  poster_url: string | null;
  poster_preset: string | null;
  member_username: string | null;
  position: number;
};

export type CustomCategory = {
  id: number;
  title: string;
  position: number;
  enabled: boolean;
  entries: CategoryEntry[];
};

/** Upload an image to admin media storage; returns its stored path. */
export async function uploadMedia(kind: 'avatar' | 'banner' | 'poster', chat: string, name: string, file: File): Promise<string> {
  const form = new FormData();
  form.set('kind', kind);
  form.set('chat', chat);
  form.set('name', name);
  form.set('file', file);
  const { path } = await apiJson<{ path: string }>('/api/admin/media', { method: 'POST', body: form });
  return path;
}

/** POST FormData via XHR — fetch has no upload-progress events. Resolves/rejects
 *  on the same { data, error } envelope contract as apiJson. */
export function xhrUpload<T>(url: string, form: FormData, onProgress: (pct: number) => void): Promise<T> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', url);
    xhr.responseType = 'json';
    xhr.upload.onprogress = e => {
      if (e.lengthComputable) onProgress(Math.floor((e.loaded / e.total) * 100));
    };
    xhr.onerror = () => reject(new Error('upload failed — network error'));
    xhr.onload = () => {
      const body = xhr.response as { data?: T; error?: { message: string } } | null;
      if (xhr.status >= 200 && xhr.status < 300 && body && !body.error) resolve(body.data as T);
      else reject(new Error(body?.error?.message ?? `${xhr.status} ${xhr.statusText}`));
    };
    xhr.send(form);
  });
}
