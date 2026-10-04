'use client';
import { useState } from 'react';
import { IntroOverlay } from './IntroOverlay';
import { ProfileTile } from '../components/ProfileTile';

type Profile = { username: string; displayName: string; tileUrl: string | null; avatarUrl: string | null };

const DEMO_ENTERED_COOKIE = 'flix_demo_entered'; // mirrors lib/demo.ts (client bundle can't read server env)

export function LoginForm({ demo = null }: { demo?: { repoUrl: string | null } | null }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState<'password' | 'whos'>('password');
  const [profiles, setProfiles] = useState<Profile[]>([]);

  // Demo: no password — the intro, a disclosure, then straight to the picker.
  const enterDemo = async () => {
    setBusy(true);
    document.cookie = `${DEMO_ENTERED_COOKIE}=1; path=/; max-age=${60 * 60 * 24 * 30}; samesite=lax`;
    const picks = await fetch('/api/flix/profiles')
      .then(r => r.json())
      .then(b => (b?.data ?? []) as Profile[])
      .catch(() => []);
    if (picks.length > 0) {
      setProfiles(picks);
      setPhase('whos');
    } else go('?');
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(body?.error?.message ?? 'Incorrect password.');
      }
      // The admin password takes you straight to the control room; the site
      // password shows the "Who's watching?" picker, then the member site.
      if (body?.data?.scope === 'admin') {
        window.location.href = '/admin';
        return;
      }
      // Now that the cookie is set, fetch the top-8-this-week grid. Cosmetic:
      // an error or empty list must never block login.
      const picks = await fetch('/api/flix/profiles')
        .then(r => r.json())
        .then(b => (b?.data ?? []) as Profile[])
        .catch(() => []);
      if (picks.length > 0) {
        setProfiles(picks);
        setPhase('whos');
      } else go('?');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
      setBusy(false);
    }
  };

  const go = (initial: string, username?: string) => {
    localStorage.setItem('flix_profile', initial);
    if (username) localStorage.setItem('flix_profile_username', username);
    else localStorage.removeItem('flix_profile_username');
    const raw = new URLSearchParams(window.location.search).get('next') || '/';
    // Member access can't enter /admin — avoid a redirect loop back to /login.
    window.location.href = raw.startsWith('/admin') ? '/' : raw;
  };

  if (phase === 'whos') {
    return (
      <div className="card">
        <h1 className="flx-display">Who&apos;s watching?</h1>
        <div className="flx-whos">
          {profiles.map(p => {
            return (
              <button key={p.username} onClick={() => go(p.displayName.slice(0, 1).toUpperCase(), p.username)}>
                <ProfileTile className="face" username={p.username} displayName={p.displayName}
                  tileUrl={p.tileUrl} avatarUrl={p.avatarUrl} />
                <span>{p.displayName}</span>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  if (demo) {
    return (
      <>
        <IntroOverlay />
        <div className="card">
          <h1 className="flx-display">NETFLIXIA</h1>
          <p className="flx-demo-note">
            <strong>Public demo.</strong> Every member and message here is fictional — a simulated
            friend-group chat, generated and then analyzed by the same ingestion, mention, sentiment
            and scoring pipeline that runs the private original.
          </p>
          <button className="flx-btn danger" type="button" onClick={enterDemo} disabled={busy}>
            {busy ? 'Loading…' : 'Start watching'}
          </button>
          {demo.repoUrl && (
            <p className="flx-demo-src"><a href={demo.repoUrl} target="_blank" rel="noreferrer">How it’s built ↗</a></p>
          )}
        </div>
      </>
    );
  }

  return (
    <>
      <IntroOverlay />
      <div className="card">
        <h1 className="flx-display">NETFLIXIA</h1>
        <p>Members only. Enter the password to keep watching.</p>
        <form onSubmit={submit}>
          <input
            className="flx-input"
            type="password"
            autoFocus
            placeholder="Password"
            value={password}
            onChange={e => setPassword(e.target.value)}
          />
          {error && <p className="err">{error}</p>}
          <button className="flx-btn danger" type="submit" disabled={busy || !password}>
            {busy ? 'Checking…' : 'Sign in'}
          </button>
        </form>
      </div>
    </>
  );
}
