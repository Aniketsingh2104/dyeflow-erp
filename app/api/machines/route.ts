import { NextRequest, NextResponse } from 'next/server'
import { guard } from '@/lib/access'
import { dbSelect, dbInsert, dbUpdate, dbDelete } from '@/lib/supabase'
import { requireAdmin } from '@/lib/auth'

export async function GET(req: NextRequest) {
  { const g = await guard(req, 'machines', 'GET'); if (g.deny) return g.deny }
  const { data, error } = await dbSelect('machines', { order: 'name.asc' },
    'id,name,capacity,status,machine_type,is_active,numbering_base_date,created_at')
  if (error) return NextResponse.json({ ok: false, error }, { status: 500 })
  return NextResponse.json({ ok: true, data })
}

export async function POST(req: NextRequest) {
  // Setup master — admin only (checked on the server — lib/auth.ts)
  { const deny = await requireAdmin(req); if (deny) return deny }
  const { action, ...payload } = await req.json()

  if (action === 'create') {
    const { data, error } = await dbInsert('machines', payload)
    if (error) return NextResponse.json({ ok: false, error }, { status: 500 })
    return NextResponse.json({ ok: true, data })
  }

  if (action === 'update') {
    const { id, ...patch } = payload
    if (!id) return NextResponse.json({ ok: false, error: 'id required' }, { status: 400 })
    const { error } = await dbUpdate('machines', { id }, patch)
    if (error) return NextResponse.json({ ok: false, error }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  if (action === 'delete') {
    const { error } = await dbDelete('machines', { id: payload.id })
    if (error) return NextResponse.json({ ok: false, error }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ ok: false, error: 'Unknown action' }, { status: 400 })
}
