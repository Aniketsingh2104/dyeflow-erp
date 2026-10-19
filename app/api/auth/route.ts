/**
 * /api/auth — sign in, sign out, and "who am I".
 *
 *   POST { username, password }   → checks dyeflow_users, sets the signed
 *                                   HttpOnly session cookie (12 hours)
 *   POST { action: 'logout' }     → clears the cookie
 *   GET                           → the signed-in user, fresh from the DB
 *                                   (401 if not signed in / deactivated)
 *
 * No built-in fallback admin any more. Passwords are stored hashed (scrypt);
 * an old plain-text password still works once and is hashed on that login.
 */
import { NextRequest, NextResponse } from 'next/server'
import { dbSelect, dbUpdate } from '@/lib/supabase'
import { hashPassword, isHashed, verifyPassword } from '@/lib/password'
import {
  SESSION_COOKIE, createSessionToken, sessionConfigured, sessionCookieOptions, requestIsHttps,
} from '@/lib/session'
import { getSession, loadActiveUser, publicUser } from '@/lib/auth'
import { forgetUser } from '@/lib/access'
import { rateHit, rateClear, rateUndo, clientIp, waitText } from '@/lib/rateLimit'

// Login attempts allowed per 15 minutes (a successful login is taken back
// off the counters, so in practice these count wrong passwords):
//   • 5 for one username from one IP address   → that user, from that place
//   • 50 for one username from anywhere          → attacks spread over many IPs
//   • 30 from one IP address for any usernames   → guessing many usernames
// IPs listed in LOGIN_TRUSTED_IPS (Vercel env, comma separated — e.g. the
// factory's public IP) only get the first limit, so an outsider can never
// lock the factory out. An admin can unlock a user in User Management.
const LOGIN_WINDOW_S = 15 * 60
const UIP_FAILS = 5
const USER_FAILS = 50
const IP_FAILS = 30
const TRUSTED_IPS = (process.env.LOGIN_TRUSTED_IPS || '').split(',').map(s => s.trim()).filter(Boolean)

// Checking a made-up password against this keeps "no such user" as slow as
// "wrong password", so usernames can't be found by timing.
let dummyHash: string | null = null
const dummy = () => (dummyHash ||= hashPassword('dyeflow-not-a-real-password'))

function clearCookie(res: NextResponse, req: NextRequest) {
  res.cookies.set(SESSION_COOKIE, '', sessionCookieOptions(requestIsHttps(req), 0))
  return res
}

export async function GET(req: NextRequest) {
  const s = getSession(req)
  if (!s) return NextResponse.json({ ok: false, error: 'Not signed in' }, { status: 401 })
  const { user, error } = await loadActiveUser(s.uid)
  if (error) return NextResponse.json({ ok: false, error: 'Database unavailable' }, { status: 503 })
  if (!user || (user.session_version || 0) !== (s.sv || 0)) {
    // inactive, deleted, or signed out / changed since this cookie was issued
    return clearCookie(NextResponse.json({ ok: false, error: 'Please sign in again' }, { status: 401 }), req)
  }
  return NextResponse.json({ ok: true, user: publicUser(user) })
}

export async function POST(req: NextRequest) {
  try {
    const { username, password, action } = await req.json()

    if (action === 'logout') {
      // Cancel this login everywhere: older cookies (other tabs, devices, a
      // copied cookie) stop working too.
      const s = getSession(req)
      if (s) {
        const { data } = await dbSelect('dyeflow_users', { id: `eq.${s.uid}`, limit: '1' }, 'id,session_version')
        if (data?.[0] && (data[0].session_version || 0) === (s.sv || 0)) {
          await dbUpdate('dyeflow_users', { id: s.uid }, { session_version: (data[0].session_version || 0) + 1 })
        }
        forgetUser(s.uid)
      }
      return clearCookie(NextResponse.json({ ok: true }), req)
    }

    if (!sessionConfigured()) {
      return NextResponse.json({ ok: false,
        error: 'Server not configured: SESSION_SECRET is missing. Ask the admin to set it.' }, { status: 500 })
    }

    if (!username || !password) {
      return NextResponse.json({ ok: false, error: 'Username and password required' }, { status: 400 })
    }

    const uname = String(username).trim().toLowerCase()
    const ip = clientIp(req)
    const trusted = TRUSTED_IPS.includes(ip)
    const keys: [string, number][] = [[`login:uip:${uname}|${ip}`, UIP_FAILS]]
    if (!trusted) keys.push([`login:user:${uname}`, USER_FAILS], [`login:ip:${ip}`, IP_FAILS])

    // Count the attempt FIRST (so many requests sent at once can't all slip
    // through before any is counted); a good login is taken back below.
    const waits = await Promise.all(keys.map(([k, n]) => rateHit(k, n, LOGIN_WINDOW_S)))
    const wait = Math.max(0, ...waits)
    if (wait > 0) {
      return NextResponse.json({ ok: false, error: `Too many wrong passwords — try again in ${waitText(wait)}.` },
        { status: 429, headers: { 'Retry-After': String(wait) } })
    }

    const { data: users, error } = await dbSelect(
      'dyeflow_users',
      { username: `eq.${uname}`, is_active: 'eq.true', limit: '1' },
      'id,username,full_name,role,permissions,password,scope_mode,unit,party,notes,session_version'
    )
    if (error) {
      return NextResponse.json({ ok: false, error: 'Database unavailable — try again shortly.' }, { status: 503 })
    }

    const user = users?.[0]
    const good = user ? verifyPassword(String(password), user.password) : (verifyPassword(String(password), dummy()), false)
    if (!good) {
      // small delay makes password guessing slower
      await new Promise(r => setTimeout(r, 400))
      return NextResponse.json({ ok: false, error: 'Invalid username or password' }, { status: 401 })
    }
    // good login: this user+place starts fresh; the attempt doesn't count elsewhere
    await Promise.all([rateClear(keys[0][0]), ...keys.slice(1).map(([k]) => rateUndo(k))])

    // Upgrade an old plain-text password to a hash on first successful login
    if (!isHashed(user.password)) {
      await dbUpdate('dyeflow_users', { id: user.id }, { password: hashPassword(String(password)) })
    }

    const token = createSessionToken({ uid: user.id, u: user.username, r: user.role || 'custom', sv: user.session_version || 0 })!
    forgetUser(user.id)
    const res = NextResponse.json({ ok: true, user: publicUser(user) })
    res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions(requestIsHttps(req)))
    return res
  } catch (err: any) {
    console.error('[/api/auth] login error:', err)
    return NextResponse.json({ ok: false, error: 'Server error — try again.' }, { status: 500 })
  }
}
