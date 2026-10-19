/**
 * proxy.ts — runs on the server before every page and API request
 * (Next.js 16 replacement for middleware.ts).
 *
 *  • No valid signed session cookie →
 *      pages: redirect to /login (then back to the page after signing in)
 *      /api:  401 JSON
 *  • Valid session → passes the user to API routes as request headers
 *    (x-dyeflow-user-id / x-dyeflow-username / x-dyeflow-role). Any copies of
 *    those headers sent by the browser are always removed first, so they
 *    can't be faked.
 *
 * Public: /login, /api/auth (sign in / out / who-am-I), /api/keep-alive and the Ollama relay
 * (it checks its own shared secret).
 */
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { SESSION_COOKIE, verifySessionToken } from '@/lib/session'

const USER_HEADERS = ['x-dyeflow-user-id', 'x-dyeflow-username', 'x-dyeflow-role']

function isPublic(pathname: string): boolean {
  return pathname === '/login'
      || pathname === '/api/auth'
      || pathname.startsWith('/api/ollama-relay/')
      || pathname === '/api/keep-alive'          // Vercel cron; checks CRON_SECRET itself
}

export function proxy(req: NextRequest) {
  const { pathname, search } = req.nextUrl

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
  headers.set('x-dyeflow-role', s.r)
  return NextResponse.next({ request: { headers } })
}

export const config = {
  // Everything except Next's own static files and plain image/font assets
  matcher: ['/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:png|jpg|jpeg|gif|svg|ico|webp|woff|woff2|ttf|txt|map)$).*)'],
}
