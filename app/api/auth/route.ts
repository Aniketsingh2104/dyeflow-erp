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

function clearCookie(res: NextResponse, req: NextRequest) {
  res.cookies.set(SESSION_COOKIE, '', sessionCookieOptions(requestIsHttps(req), 0))
  return res
}

export async function GET(req: NextRequest) {
  const s = getSession(req)
  if (!s) return NextResponse.json({ ok: false, error: 'Not signed in' }, { status: 401 })
  const { user, error } = await loadActiveUser(s.uid)
  if (error) return NextResponse.json({ ok: false, error: 'Database unavailable' }, { status: 503 })
  if (!user) {
    return clearCookie(NextResponse.json({ ok: false, error: 'Account inactive' }, { status: 401 }), req)
  }
  return NextResponse.json({ ok: true, user: publicUser(user) })
}

export async function POST(req: NextRequest) {
  try {
    const { username, password, action } = await req.json()

    if (action === 'logout') return clearCookie(NextResponse.json({ ok: true }), req)

    if (!sessionConfigured()) {
      return NextResponse.json({ ok: false,
        error: 'Server not configured: SESSION_SECRET is missing. Ask the admin to set it.' }, { status: 500 })
    }

    if (!username || !password) {
      return NextResponse.json({ ok: false, error: 'Username and password required' }, { status: 400 })
    }

    const uname = String(username).trim().toLowerCase()

    const { data: users, error } = await dbSelect(
      'dyeflow_users',
      { username: `eq.${uname}`, is_active: 'eq.true', limit: '1' },
      'id,username,full_name,role,permissions,password,scope_mode,unit,party,notes'
    )
    if (error) {
      return NextResponse.json({ ok: false, error: 'Database unavailable — try again shortly.' }, { status: 503 })
    }

    const user = users?.[0]
    if (!user || !verifyPassword(String(password), user.password)) {
      // small delay makes password guessing slower
      await new Promise(r => setTimeout(r, 400))
      return NextResponse.json({ ok: false, error: 'Invalid username or password' }, { status: 401 })
    }

    // Upgrade an old plain-text password to a hash on first successful login
    if (!isHashed(user.password)) {
      await dbUpdate('dyeflow_users', { id: user.id }, { password: hashPassword(String(password)) })
    }

    const token = createSessionToken({ uid: user.id, u: user.username, r: user.role || 'custom' })!
    const res = NextResponse.json({ ok: true, user: publicUser(user) })
    res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions(requestIsHttps(req)))
    return res
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message || 'Server error' }, { status: 500 })
  }
}
