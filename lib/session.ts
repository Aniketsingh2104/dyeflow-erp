/**
 * lib/session.ts — signed login session (server only: proxy.ts + API routes).
 *
 * The session lives in an HttpOnly cookie that browser JavaScript can't read
 * or change. Its value is   base64url(JSON payload) + "." + HMAC-SHA256 signature
 * signed with SESSION_SECRET (env var, ≥ 32 characters). Editing the payload
 * breaks the signature, so a user can't make themselves admin.
 *
 * localStorage 'dyeflow_session' still exists, but only for the UI (name,
 * menu permissions). It grants nothing — every request is checked here.
 */
import crypto from 'node:crypto'

export const SESSION_COOKIE = 'dyeflow_auth'
export const SESSION_HOURS  = 12          // one shift — then sign in again

export interface SessionData {
  uid: string      // dyeflow_users.id
  u:   string      // username
  r:   string      // role at sign-in (admin checks re-read the DB)
  sv?: number      // dyeflow_users.session_version at sign-in — a newer number in
                   // the DB (logout, role / permission / password change,
                   // deactivation) makes this cookie invalid (lib/access.ts)
  exp: number      // expiry, ms since epoch
}

function getSecret(): string | null {
  const s = process.env.SESSION_SECRET || ''
  return s.length >= 32 ? s : null
}

export function sessionConfigured(): boolean {
  return !!getSecret()
}

function sign(payload: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(payload).digest('base64url')
}

export function createSessionToken(d: Omit<SessionData, 'exp'>, hours = SESSION_HOURS): string | null {
  const secret = getSecret()
  if (!secret) return null
  const data: SessionData = { ...d, exp: Date.now() + hours * 3600_000 }
  const payload = Buffer.from(JSON.stringify(data)).toString('base64url')
  return `${payload}.${sign(payload, secret)}`
}

export function verifySessionToken(token?: string | null): SessionData | null {
  const secret = getSecret()
  if (!secret || !token) return null
  const dot = token.indexOf('.')
  if (dot < 1) return null
  const payload = token.slice(0, dot)
  const given   = Buffer.from(token.slice(dot + 1))
  const expect  = Buffer.from(sign(payload, secret))
  if (given.length !== expect.length || !crypto.timingSafeEqual(given, expect)) return null
  try {
    const d = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as SessionData
    if (!d?.uid || !d?.u || typeof d.exp !== 'number' || d.exp < Date.now()) return null
    return d
  } catch {
    return null
  }
}

/** Cookie options. `secure` only over https so LAN (http://192.168…) logins still work. */
export function sessionCookieOptions(isHttps: boolean, maxAgeSeconds = SESSION_HOURS * 3600) {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure:   isHttps,
    path:     '/',
    maxAge:   maxAgeSeconds,
  }
}

/** True when the browser reached us over https (directly or behind Vercel / Cloudflare). */
export function requestIsHttps(req: { headers: Headers; nextUrl?: { protocol: string } }): boolean {
  const proto = req.headers.get('x-forwarded-proto') || req.nextUrl?.protocol || ''
  return proto.replace(':', '').split(',')[0].trim() === 'https'
}
