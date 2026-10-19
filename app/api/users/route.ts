/**
 * /api/users — user management. ADMIN ONLY (checked on the server).
 *
 * Passwords are always stored hashed. GET never returns passwords — only
 * whether one is set and whether it is already hashed.
 * Updates only change the fields that are sent (no more silently resetting
 * the full name or re-activating an inactive user).
 * An admin can't delete, deactivate or demote their OWN account (prevents
 * locking everyone out).
 */
import { NextRequest, NextResponse } from 'next/server'
import { dbSelect, dbInsert, dbUpdate, dbDelete, auditLog } from '@/lib/supabase'
import { requireAdmin, getSession } from '@/lib/auth'
import { forgetUser } from '@/lib/access'
import { unlockLogin } from '@/lib/rateLimit'
import { SESSION_COOKIE, createSessionToken, sessionCookieOptions, requestIsHttps } from '@/lib/session'

// New and changed passwords (existing shorter ones keep working until changed)
const MIN_PASSWORD = 8

/** Raise the user's session_version → every login cookie they hold stops working. */
async function signOutEverywhere(id: string): Promise<number | null> {
  const { data } = await dbSelect('dyeflow_users', { id: `eq.${id}`, limit: '1' }, 'id,session_version')
  if (!data?.[0]) return null
  const next = (data[0].session_version || 0) + 1
  await dbUpdate('dyeflow_users', { id }, { session_version: next })
  forgetUser(id)
  return next
}
import { hashPassword, isHashed } from '@/lib/password'

export async function GET(req: NextRequest) {
  const deny = await requireAdmin(req)
  if (deny) return deny

  const { data, error } = await dbSelect('dyeflow_users', { order: 'username.asc' },
    'id,username,full_name,role,permissions,scope_mode,unit,party,notes,is_active,created_at,password')
  if (error) return NextResponse.json({ ok: false, error }, { status: 500 })
  const safe = (data || []).map(({ password, ...u }: any) => ({
    ...u,
    has_password:    !!password,
    password_hashed: isHashed(password),
  }))
  return NextResponse.json({ ok: true, data: safe })
}

export async function POST(req: NextRequest) {
  const deny = await requireAdmin(req)
  if (deny) return deny
  const me = getSession(req)!

  const body = await req.json()
  const { action } = body

  if (action === 'create') {
    const { username, password, full_name, role, permissions, scope_mode, unit, party, notes } = body
    if (!username?.trim()) return NextResponse.json({ ok: false, error: 'Username required' }, { status: 400 })
    if (!password?.trim() || password.trim().length < MIN_PASSWORD) {
      return NextResponse.json({ ok: false, error: `Password must be at least ${MIN_PASSWORD} characters` }, { status: 400 })
    }
    const uname = username.trim().toLowerCase()

    const { data: existing } = await dbSelect('dyeflow_users', { username: `eq.${uname}` }, 'id')
    if (existing?.length) return NextResponse.json({ ok: false, error: 'Username already exists.' }, { status: 409 })

    const { error } = await dbInsert('dyeflow_users', {
      username:    uname,
      password:    hashPassword(password),
      full_name:   full_name?.trim() || username.trim(),
      role:        role || 'custom',
      permissions: role === 'admin' ? null : (permissions || null),
      scope_mode:  scope_mode || 'all',
      unit:        unit || null,
      party:       party || null,
      notes:       notes || null,
      is_active:   true,
    })
    if (error) return NextResponse.json({ ok: false, error }, { status: 500 })
    await auditLog({ action: 'user_create', entity_type: 'user', entity_id: uname, new_value: role || 'custom' })
    return NextResponse.json({ ok: true })
  }

  if (action === 'update') {
    const { id, password } = body
    if (!id) return NextResponse.json({ ok: false, error: 'id required' }, { status: 400 })
    const isSelf = id === me.uid

    if (isSelf && body.is_active === false) {
      return NextResponse.json({ ok: false, error: "You can't deactivate your own account." }, { status: 400 })
    }
    if (isSelf && body.role !== undefined && body.role !== 'admin') {
      return NextResponse.json({ ok: false, error: "You can't remove admin from your own account." }, { status: 400 })
    }

    // Only change what was actually sent
    const patch: Record<string, any> = { updated_at: new Date().toISOString() }
    if (body.full_name   !== undefined) patch.full_name   = String(body.full_name || '').trim() || null
    if (body.role        !== undefined) patch.role        = body.role || 'custom'
    if (body.permissions !== undefined) patch.permissions = body.role === 'admin' ? null : (body.permissions || null)
    if (body.scope_mode  !== undefined) patch.scope_mode  = body.scope_mode || 'all'
    if (body.unit        !== undefined) patch.unit        = body.unit || null
    if (body.party       !== undefined) patch.party       = body.party || null
    if (body.notes       !== undefined) patch.notes       = body.notes || null
    if (typeof body.is_active === 'boolean') patch.is_active = body.is_active
    if (password?.trim()) {
      if (password.trim().length < MIN_PASSWORD) return NextResponse.json({ ok: false, error: `Password must be at least ${MIN_PASSWORD} characters` }, { status: 400 })
      patch.password = hashPassword(password)
    }
    if (body.username !== undefined) {
      const uname = String(body.username || '').trim().toLowerCase()
      if (!uname) return NextResponse.json({ ok: false, error: 'Username required' }, { status: 400 })
      const { data: clash } = await dbSelect('dyeflow_users', { username: `eq.${uname}`, id: `neq.${id}` }, 'id')
      if (clash?.length) return NextResponse.json({ ok: false, error: 'Username already exists.' }, { status: 409 })
      patch.username = uname
    }

    const { error } = await dbUpdate('dyeflow_users', { id }, patch)
    if (error) return NextResponse.json({ ok: false, error }, { status: 500 })
    const changed = Object.keys(patch).filter(k => k !== 'updated_at')
    await auditLog({ action: 'user_update', entity_type: 'user', entity_id: id, new_value: changed.join(',') })
    forgetUser(id)

    // Anything that changes what this user may do signs them out everywhere,
    // so the change takes effect at once (they just sign in again).
    const res = NextResponse.json({ ok: true })
    if (changed.some(k => ['role', 'permissions', 'is_active', 'password', 'username'].includes(k))) {
      const sv = await signOutEverywhere(id)
      if (isSelf && sv !== null && body.is_active !== false) {
        // keep the admin who made the change signed in on this device
        const token = createSessionToken({ uid: id, u: patch.username || me.u, r: patch.role || me.r, sv })
        if (token) res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions(requestIsHttps(req)))
      }
    }
    return res
  }

  if (action === 'delete') {
    const { id } = body
    if (!id) return NextResponse.json({ ok: false, error: 'id required' }, { status: 400 })
    if (id === me.uid) return NextResponse.json({ ok: false, error: "You can't delete your own account." }, { status: 400 })
    const { error } = await dbDelete('dyeflow_users', { id })
    if (error) return NextResponse.json({ ok: false, error }, { status: 500 })
    forgetUser(id)
    await auditLog({ action: 'user_delete', entity_type: 'user', entity_id: id })
    return NextResponse.json({ ok: true })
  }

  // Clear a login block (too many wrong passwords) — admin only
  if (action === 'unlock_login') {
    const { id } = body
    if (!id) return NextResponse.json({ ok: false, error: 'id required' }, { status: 400 })
    const { data: u } = await dbSelect('dyeflow_users', { id: `eq.${id}`, limit: '1' }, 'id,username')
    if (!u?.[0]) return NextResponse.json({ ok: false, error: 'User not found' }, { status: 404 })
    const { error } = await unlockLogin(u[0].username)
    if (error) return NextResponse.json({ ok: false, error }, { status: 500 })
    await auditLog({ action: 'user_unlock_login', entity_type: 'user', entity_id: u[0].username })
    return NextResponse.json({ ok: true })
  }

  if (action === 'reset_password') {
    const { id, password } = body
    if (!id || !password?.trim()) return NextResponse.json({ ok: false, error: 'id and password required' }, { status: 400 })
    if (password.trim().length < MIN_PASSWORD) return NextResponse.json({ ok: false, error: `Password must be at least ${MIN_PASSWORD} characters` }, { status: 400 })
    const { error } = await dbUpdate('dyeflow_users', { id }, { password: hashPassword(password), updated_at: new Date().toISOString() })
    if (error) return NextResponse.json({ ok: false, error }, { status: 500 })
    await auditLog({ action: 'user_reset_password', entity_type: 'user', entity_id: id })
    { const { data: u } = await dbSelect('dyeflow_users', { id: `eq.${id}`, limit: '1' }, 'username')
      if (u?.[0]?.username) await unlockLogin(u[0].username) }   // a new password also lifts a login block
    const sv = await signOutEverywhere(id)       // old logins of this user stop working
    const res = NextResponse.json({ ok: true })
    if (id === me.uid && sv !== null) {
      const token = createSessionToken({ uid: id, u: me.u, r: me.r, sv })
      if (token) res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions(requestIsHttps(req)))
    }
    return res
  }

  return NextResponse.json({ ok: false, error: 'Unknown action' }, { status: 400 })
}
