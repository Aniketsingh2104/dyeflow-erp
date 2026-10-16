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
    if (!password?.trim() || password.trim().length < 4) {
      return NextResponse.json({ ok: false, error: 'Password must be at least 4 characters' }, { status: 400 })
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
      if (password.trim().length < 4) return NextResponse.json({ ok: false, error: 'Password must be at least 4 characters' }, { status: 400 })
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
    return NextResponse.json({ ok: true })
  }

  if (action === 'delete') {
    const { id } = body
    if (!id) return NextResponse.json({ ok: false, error: 'id required' }, { status: 400 })
    if (id === me.uid) return NextResponse.json({ ok: false, error: "You can't delete your own account." }, { status: 400 })
    const { error } = await dbDelete('dyeflow_users', { id })
    if (error) return NextResponse.json({ ok: false, error }, { status: 500 })
    await auditLog({ action: 'user_delete', entity_type: 'user', entity_id: id })
    return NextResponse.json({ ok: true })
  }

  if (action === 'reset_password') {
    const { id, password } = body
    if (!id || !password?.trim()) return NextResponse.json({ ok: false, error: 'id and password required' }, { status: 400 })
    if (password.trim().length < 4) return NextResponse.json({ ok: false, error: 'Password must be at least 4 characters' }, { status: 400 })
    const { error } = await dbUpdate('dyeflow_users', { id }, { password: hashPassword(password), updated_at: new Date().toISOString() })
    if (error) return NextResponse.json({ ok: false, error }, { status: 500 })
    await auditLog({ action: 'user_reset_password', entity_type: 'user', entity_id: id })
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ ok: false, error: 'Unknown action' }, { status: 400 })
}
