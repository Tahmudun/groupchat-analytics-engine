'use client';
import { createContext, useContext, type ReactNode } from 'react';
import { keyartFor } from '@/lib/flix/keyart';
import { initials, mediaUrl } from '@/lib/flix/format';

/** username → pfp url, provided once per page by the (site) layout so every
 *  chat surface (episodes, search results, player reel, rewind casts) can
 *  resolve a sender's pfp by name — including in client-fetched data. */
const AvatarsContext = createContext<Record<string, string>>({});

export function AvatarsProvider({ avatars, children }: { avatars: Record<string, string>; children: ReactNode }) {
  return <AvatarsContext.Provider value={avatars}>{children}</AvatarsContext.Provider>;
}

export function useAvatar(username: string): string | null {
  const map = useContext(AvatarsContext);
  return mediaUrl(map[username] ?? null);
}

/** The small circular pfp shown wherever a member talks. Falls back to the
 *  keyart-initials tile when they have no upload. Size in px. */
export function Pfp({ name, size = 28 }: { name: string; size?: number }) {
  const src = useAvatar(name);
  const style = { width: size, height: size, fontSize: size * 0.36 };
  return src
    ? <img className="flx-avatar" src={src} alt="" style={style} />
    : <span className="flx-avatar flx-display" style={{ ...style, background: keyartFor(name).css }}>{initials(name)}</span>;
}
