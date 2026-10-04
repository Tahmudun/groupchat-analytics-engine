import { keyartFor } from '@/lib/flix/keyart';
import { initials, mediaUrl } from '@/lib/flix/format';

/** Square Netflix-style viewer tile. A dedicated tile upload is already
 * square and renders directly. Pfp fallbacks get a blurred, enlarged copy
 * behind a softly feathered foreground so a circular source blends into the
 * square instead of looking like a circle pasted onto a box. */
export function ProfileTile({
  username,
  displayName,
  tileUrl,
  avatarUrl,
  className = '',
}: {
  username: string;
  displayName: string;
  tileUrl: string | null;
  avatarUrl: string | null;
  className?: string;
}) {
  const tile = mediaUrl(tileUrl);
  const avatar = mediaUrl(avatarUrl);
  const classes = `flx-profile-tile${className ? ` ${className}` : ''}`;

  if (tile) return <img className={classes} src={tile} alt="" />;
  if (avatar) {
    return (
      <span className={`${classes} pfp-blend`}>
        <span className="backdrop" aria-hidden="true" style={{ backgroundImage: `url(${JSON.stringify(avatar)})` }} />
        <img src={avatar} alt="" />
      </span>
    );
  }
  return (
    <span className={`${classes} flx-display`} style={{ background: keyartFor(username).css }}>
      {initials(displayName)}
    </span>
  );
}
