'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { ProfileTile } from '@/app/components/ProfileTile';

type SelectedProfile = {
  username: string;
  displayName: string;
  tileUrl: string | null;
  avatarUrl: string | null;
};

const LINKS = [
  { href: '/universe', label: 'Universe', special: true },
  { href: '/search', label: 'Search' },
  { href: '/duos', label: 'Duos' },
  { href: '/rewind', label: 'Rewind' },
] as const;

export function Nav() {
  const pathname = usePathname();
  const [initial, setInitial] = useState('?');
  const [profile, setProfile] = useState<SelectedProfile | null>(null);
  const [solid, setSolid] = useState(false);

  useEffect(() => {
    const onScroll = () => setSolid(window.scrollY > 24);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [pathname]);

  useEffect(() => {
    let controller: AbortController | null = null;
    const loadSelectedProfile = () => {
      const savedInitial = (localStorage.getItem('flix_profile') ?? '?').slice(0, 1).toUpperCase();
      const username = localStorage.getItem('flix_profile_username');
      setInitial(savedInitial);
      setProfile(null);
      controller?.abort();
      if (!username) return;
      controller = new AbortController();
      fetch(`/api/flix/profiles/${encodeURIComponent(username)}`, { signal: controller.signal })
        .then(async response => response.ok ? response.json() : null)
        .then(body => { if (body?.data) setProfile(body.data as SelectedProfile); })
        .catch(error => { if (error instanceof Error && error.name !== 'AbortError') console.error(error); });
    };
    loadSelectedProfile();
    window.addEventListener('storage', loadSelectedProfile);
    window.addEventListener('flix-profile-change', loadSelectedProfile);
    return () => {
      controller?.abort();
      window.removeEventListener('storage', loadSelectedProfile);
      window.removeEventListener('flix-profile-change', loadSelectedProfile);
    };
  }, []);

  return (
    <nav className={`flx-nav${solid || pathname?.startsWith('/universe') ? ' solid' : ''}`}>
      <Link href="/" className="flx-wordmark" aria-label="FLIX home">FLIX</Link>
      <div className="links">
        {LINKS.map(l => (
          <Link key={l.href} href={l.href} className={'special' in l && l.special ? 'universe-link' : undefined}
            aria-label={l.label} aria-current={pathname?.startsWith(l.href) ? 'page' : undefined}>
            {'special' in l && l.special && <span aria-hidden="true">✦</span>}<b>{l.label}</b>
          </Link>
        ))}
      </div>
      <Link href="/login?switch=1" className="flx-profile" aria-label={profile ? `Switch profile, currently ${profile.displayName}` : 'Switch profile'}>
        {profile
          ? <ProfileTile username={profile.username} displayName={profile.displayName}
              tileUrl={profile.tileUrl} avatarUrl={profile.avatarUrl} />
          : initial}
      </Link>
    </nav>
  );
}
