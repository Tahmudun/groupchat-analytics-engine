import { NextResponse, type NextRequest } from 'next/server';
import { verifyToken, COOKIE_NAMES } from '@/lib/auth/session';
import { DEMO_MODE, DEMO_ENTERED_COOKIE, isAdminPath } from '@/lib/demo';

// Middleware runs on the edge — only Web Crypto (session.ts), never argon2 or
// postgres. Password checks and rate limiting live in the login route.

const SECRET = process.env.SESSION_SECRET;
const SITE_HASH = process.env.SITE_PASSWORD_HASH;
const ADMIN_HASH = process.env.ADMIN_PASSWORD_HASH;

function isPublic(path: string): boolean {
  return (
    path === '/login' ||
    path.startsWith('/api/auth/') ||
    path.startsWith('/api/v1/') || // bearer-token gated internally
    path.startsWith('/_next/') ||
    path === '/favicon.ico' ||
    path === '/robots.txt'
  );
}

function unauthorized(req: NextRequest, redirectTo: string): NextResponse {
  if (req.nextUrl.pathname.startsWith('/api/')) {
    return NextResponse.json({ error: { code: 'unauthorized', message: 'sign in required' } }, { status: 401 });
  }
  const url = req.nextUrl.clone();
  url.pathname = redirectTo;
  url.search = `?next=${encodeURIComponent(req.nextUrl.pathname)}`;
  return NextResponse.redirect(url);
}

/** Public demo: no gates at all, admin doesn't exist, first visit starts at the intro. */
function demoRoute(req: NextRequest): NextResponse {
  const { pathname } = req.nextUrl;
  if (isAdminPath(pathname)) {
    return pathname.startsWith('/api/')
      ? NextResponse.json({ error: { code: 'not_found', message: 'not found' } }, { status: 404 })
      : new NextResponse('Not found', { status: 404 });
  }
  if (pathname === '/' && !req.cookies.get(DEMO_ENTERED_COOKIE)) {
    const url = req.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (DEMO_MODE) return demoRoute(req);

  // Gates are dormant until configured — keeps local dev open.
  const siteGateOn = Boolean(SECRET && SITE_HASH);
  const adminGateOn = Boolean(SECRET && ADMIN_HASH);
  if (!siteGateOn && !adminGateOn) {
    // A production deployment must never expose the admin surface merely
    // because authentication variables were omitted.
    if (pathname.startsWith('/admin') || pathname.startsWith('/api/admin')) {
      if (process.env.NODE_ENV === 'production') return unauthorized(req, '/login');
    } else return NextResponse.next();
  }
  if (isPublic(pathname)) return NextResponse.next();

  const isAdmin = pathname.startsWith('/admin') || pathname.startsWith('/api/admin');

  if (siteGateOn) {
    const okSite = await verifyToken(req.cookies.get(COOKIE_NAMES.site)?.value, 'site', SECRET!);
    if (!okSite) return unauthorized(req, '/login');
  }
  if (isAdmin) {
    // Never let the site password imply admin access. A configured site gate
    // without a configured admin gate is a deployment error, so fail closed.
    if (!adminGateOn) return unauthorized(req, '/login');
    const okAdmin = await verifyToken(req.cookies.get(COOKIE_NAMES.admin)?.value, 'admin', SECRET!);
    if (!okAdmin) return unauthorized(req, '/login');
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
