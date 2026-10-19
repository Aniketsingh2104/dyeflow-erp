/**
 * proxy.ts — runs on the server before every page and API request
 * (Next.js 16 replacement for middleware.ts).
 *
 *  • No valid signed session cookie →
 *      pages: redirect to /login (then back to the page after signing in)
 *      /api:  401 JSON
 *  • Valid session → passes the user to API routes as request headers
 *    (x-dyeflow-user-id / x-dyeflow-username). Any copies of those headers
 *    (and the old x-dyeflow-role) sent by the browser are always removed
 *    first, so they can't be faked. Roles and permissions are NOT taken from
 *    here — every API reads them from the database (lib/access.ts).
 *
 * Public: /login, /api/auth (sign in / out / who-am-I), /api/keep-alive and the Ollama relay
 * (it checks its own shared secret).
 */
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { SESSION_COOKIE, verifySessionToken } from '@/lib/session'

const USER_HEADERS = ['x-dyeflow-user-id', 'x-dyeflow-username', 'x-dyeflow-role']

// The Cloudflare tunnel host points at the app on the factory PC. Through it
// only the Ollama relay may be reached — never the ERP pages or other APIs.
const RELAY_ONLY_HOSTS = (process.env.RELAY_ONLY_HOSTS || 'ollama.ginzaapp.in')
  .split(',').map(h => h.trim().toLowerCase()).filter(Boolean)

function hostOf(req: NextRequest): string {
  const h = req.headers.get('x-forwarded-host') || req.headers.get('host') || ''
  return h.split(',')[0].trim().toLowerCase().replace(/:\d+$/, '')
}

function isPublic(pathname: string): boolean {
  return pathname === '/login'
      || pathname === '/api/auth'
      || pathname.startsWith('/api/ollama-relay/')
      || pathname === '/api/keep-alive'          // Vercel cron; checks CRON_SECRET itself
}

export function proxy(req: NextRequest) {
  const { pathname, search } = req.nextUrl

  // On the factory PC (not on Vercel) anything that came through Cloudflare
  // (cf-connecting-ip is set by the tunnel) is treated the same way, in case
  // the tunnel passes a different Host header.
  const viaTunnel = RELAY_ONLY_HOSTS.includes(hostOf(req))
    || (process.env.VERCEL !== '1' && !!req.headers.get('cf-connecting-ip'))
  if (viaTunnel && !pathname.startsWith('/api/ollama-relay/')) {
    return new NextResponse('Not found', { status: 404 })
  }

  const headers = new Headers(req.headers)
  for (const h of USER_HEADERS) headers.delete(h)

  if (isPublic(pathname)) {
    return NextResponse.next({ request: { headers } })
  }

  const s = verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value)
  if (!s) {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json(
        { ok: false, error: 'Not signed in — please sign in again.' },
        { status: 401, headers: { 'x-dyeflow-auth': 'required' } },
      )
    }
    const url = req.nextUrl.clone()
    url.pathname = '/login'
    url.search = pathname && pathname !== '/' ? `?next=${encodeURIComponent(pathname + search)}` : ''
    return NextResponse.redirect(url)
  }

  headers.set('x-dyeflow-user-id', s.uid)
  headers.set('x-dyeflow-username', s.u)
  return NextResponse.next({ request: { headers } })
}

export const config = {
  // Everything except Next's own built files, the favicon and the few image
  // files that sit directly in /public (file.svg, next.svg …). A page address
  // that merely ENDS in .png / .txt (e.g. /fms/D.png) still gets the login check.
  matcher: ['/((?!_next/static/|_next/image|favicon\\.ico$|[^/]+\\.svg$).*)'],
}
