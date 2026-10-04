'use client';
import { fmtDate } from '@/lib/flix/format';
import { Pfp } from './Avatars';
import type { Episode } from '@/lib/flix/data';

const MEDIA_LABEL: Record<string, string> = {
  photo: '📷 Photo', video: '🎬 Video', audio: '🎙 Audio',
  gif: 'GIF', reel: '🎬 Reel', link: '🔗 Link',
};

/** A message rendered as an "episode". Clicking opens the moment player when a
 *  parent supplies onOpen (the search page); everywhere else it deep-links to
 *  the player on the search route. */
export function EpisodeCard({ episode, onOpen }: { episode: Episode; onOpen?: (id: string) => void }) {
  const media = episode.mediaType ? MEDIA_LABEL[episode.mediaType] ?? episode.mediaType : null;
  const body = episode.content || (media ? `[${media}]` : '[no text]');
  const open = () => {
    if (onOpen) onOpen(episode.id);
    else window.location.href = `/search?play=${encodeURIComponent(episode.id)}`;
  };
  return (
    <button className="flx-episode" type="button" onClick={open}>
      <span className="thumb"><Pfp name={episode.sender} size={44} /></span>
      <span className="body">
        <span className="meta">
          <b>{episode.sender}</b>
          <span>{fmtDate(episode.sentAt)}</span>
          {media && <span>{media}</span>}
        </span>
        <span className="text">{body}</span>
      </span>
      {episode.reactionCount > 0 && <span className="rx">♥ {episode.reactionCount}</span>}
    </button>
  );
}
