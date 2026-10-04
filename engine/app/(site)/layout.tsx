import type { ReactNode } from 'react';
import './flix.css';
import '../artframe.css';
import { Nav } from './components/Nav';
import { AvatarsProvider } from './components/Avatars';
import { getAvatarMap } from '@/lib/flix/data';
import { DemoBadge } from './components/DemoBadge';
import { DEMO_MODE, DEMO_REPO_URL } from '@/lib/demo';

export default async function SiteLayout({ children }: { children: ReactNode }) {
  // Pfps resolve by sender name on every chat surface (episodes, search,
  // player, rewind) — fetched once per page, never blocks rendering.
  const avatars = await getAvatarMap().catch(() => ({}));
  return (
    <div className="flx">
      <Nav />
      <AvatarsProvider avatars={avatars}>
        <main className="flx-main">{children}</main>
      </AvatarsProvider>
      {DEMO_MODE && <DemoBadge repoUrl={DEMO_REPO_URL} />}
    </div>
  );
}
