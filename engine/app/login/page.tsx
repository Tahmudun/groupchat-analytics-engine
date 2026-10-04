import '../(site)/flix.css';
import { LoginForm } from './LoginForm';
import { DEMO_MODE, DEMO_REPO_URL } from '@/lib/demo';

export const dynamic = 'force-dynamic';

// The "Who's watching?" grid is fetched by LoginForm AFTER the password
// succeeds (/api/flix/profiles, cookie-gated) — member names and photos never
// ship in this pre-auth HTML.
export default function LoginPage() {
  return (
    <div className="flx">
      <div className="flx-gate">
        <LoginForm demo={DEMO_MODE ? { repoUrl: DEMO_REPO_URL } : null} />
      </div>
    </div>
  );
}
