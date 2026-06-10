import { NextRequest, NextResponse } from 'next/server'

// Public paths that never require auth
const PUBLIC = ['/login', '/api/auth', '/api/db', '/_next', '/favicon']

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  // Allow public paths
  if (PUBLIC.some(p => pathname.startsWith(p))) {
    return NextResponse.next()
  }

  // Check for session cookie
  const session = req.cookies.get('dyeflow_session')?.value
  if (!session) {
    const loginUrl = new URL('/login', req.url)
    return NextResponse.redirect(loginUrl)
  }

  // Validate session has a username
  try {
    const parsed = JSON.parse(session)
    if (!parsed?.username) {
      const loginUrl = new URL('/login', req.url)
      return NextResponse.redirect(loginUrl)
    }
  } catch {
    const loginUrl = new URL('/login', req.url)
    return NextResponse.redirect(loginUrl)
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
}
