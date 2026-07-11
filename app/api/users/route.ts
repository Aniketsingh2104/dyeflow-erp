import { NextRequest, NextResponse } from 'next/server'
import { dbSelect, dbInsert, dbUpdate, dbDelete } from '@/lib/supabase'

// GET — list all users from Supabase dyeflow_users table
export async function GET() {
  const { data, error } = await dbSelect('dyeflow_users', { order: 'username.asc' },
    'id,username,full_name,role,permissions,scope_mode,unit,party,notes,is_active,created_at')
  if (error) return NextResponse.json({ ok: false, error }, { status: 500 })
  return NextResponse.json({ ok: true, data: data || [] })
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { action } = body

  if (action === 'create') {
    const { username, password, full_name, role, permissions, scope_mode, unit, party, notes } = body
    if (!username?.trim()) return NextResponse.json({ ok: false, error: 'Username required' }, { status: 400 })
    if (!password?.trim()) return NextResponse.json({ ok: false, error: 'Password required' }, { status: 400 })

    // Check duplicate
    const { data: existing } = await dbSelect('dyeflow_users', { username: `eq.${username.trim().toLowerCase()}` }, 'id')
    if (existing?.length) return NextResponse.json({ ok: false, error: 'Username already exists.' }, { status: 409 })

    const { error } = await dbInsert('dyeflow_users', {
      username:    username.trim().toLowerCase(),
      password:    password.trim(),
      full_name:   full_name || username,
      role:        role || 'custom',
      permissions: permissions || null,
      scope_mode:  scope_mode || 'all',
      unit:        unit || null,
      party:       party || null,
      notes:       notes || null,
      is_active:   true,
    })
    if (error) return NextResponse.json({ ok: false, error }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  if (action === 'update') {
    const { id, password, ...patch } = body
    if (!id) return NextResponse.json({ ok: false, error: 'id required' }, { status: 400 })
    const updateData: Record<string, any> = {
      full_name:   patch.full_name,
      role:        patch.role || 'custom',
      permissions: patch.permissions || null,
      scope_mode:  patch.scope_mode || 'all',
      unit:        patch.unit || null,
      party:       patch.party || null,
      notes:       patch.notes || null,
      is_active:   patch.is_active !== false,
      updated_at:  new Date().toISOString(),
    }
    if (password?.trim()) updateData.password = password.trim()
    const { error } = await dbUpdate('dyeflow_users', { id }, updateData)
    if (error) return NextResponse.json({ ok: false, error }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  if (action === 'delete') {
    const { id } = body
    if (!id) return NextResponse.json({ ok: false, error: 'id required' }, { status: 400 })
    const { error } = await dbDelete('dyeflow_users', { id })
    if (error) return NextResponse.json({ ok: false, error }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  if (action === 'reset_password') {
    const { id, password } = body
    if (!id || !password?.trim()) return NextResponse.json({ ok: false, error: 'id and password required' }, { status: 400 })
    const { error } = await dbUpdate('dyeflow_users', { id }, { password: password.trim(), updated_at: new Date().toISOString() })
    if (error) return NextResponse.json({ ok: false, error }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ ok: false, error: 'Unknown action' }, { status: 400 })
}
