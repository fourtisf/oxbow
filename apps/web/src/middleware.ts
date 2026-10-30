import { NextResponse, type NextRequest } from 'next/server';

/**
 * Region restriction: when the visitor's country (from a header set by the
 * proxy in front of the app, e.g. Cloudflare's CF-IPCountry or an Nginx
 * GeoIP2 variable) is in GEO_BLOCKED_COUNTRIES, every page except the
 * informational ones shows /restricted. Empty list = no blocking.
 */
const OPEN_WHEN_RESTRICTED = ['/restricted', '/terms', '/privacy', '/risk', '/docs', '/status'];

function blockedCountries(): string[] {
  return (process.env.GEO_BLOCKED_COUNTRIES ?? '')
    .split(',')
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const header = process.env.GEO_COUNTRY_HEADER || 'cf-ipcountry';
  const country = req.headers.get(header)?.trim().toUpperCase();
  const blocked = blockedCountries();

  if (country && blocked.includes(country) && !OPEN_WHEN_RESTRICTED.some((p) => pathname === p || pathname.startsWith(p + '/'))) {
    const url = req.nextUrl.clone();
    url.pathname = '/restricted';
    url.search = '';
    return NextResponse.rewrite(url);
  }
  return NextResponse.next();
}

export const config = {
  // Pages only: skip Next internals, metadata routes and static files.
  matcher: ['/((?!_next/|api/|icon|opengraph-image|twitter-image|robots.txt|sitemap.xml|.*\\.[a-z0-9]+$).*)'],
};
