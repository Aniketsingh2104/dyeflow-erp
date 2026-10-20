import { NextRequest, NextResponse } from 'next/server'
import { guard } from '@/lib/access'
import { dbSelect, dbInsert, dbUpdate, dbDelete } from '@/lib/supabase'
import { requireAdmin } from '@/lib/auth'
import { cleanSections } from '@/lib/machineSections'

export async function GET(req: NextRequest) {
  { const g = await guard(req, 'supervisors', 'GET'); if (g.deny) return g.deny }
  const { data, error } = await dbSelect('supervisors', { order: 'name.asc' },
    'id,name,email,phone,articles,is_active,default_sections,created_at')
  if (error) return NextResponse.json({ ok: false, error }, { status: 500 })
  return NextResponse.json({ ok: true, data })
}

export async function POST(req: NextRequest) {
  // Setup master — admin only (checked on the server — lib/auth.ts)
  { const deny = await requireAdmin(req); if (deny) return deny }
  const { action, ...payload } = await req.json()

  if (action === 'create') {
    if ('default_sections' in payload) payload.default_sections = cleanSections(payload.default_sections)
    const { data, error } = await dbInsert('supervisors', payload)
    if (error) return NextResponse.json({ ok: false, error }, { status: 500 })
    return NextResponse.json({ ok: true, data })
  }

  if (action === 'update') {
    const { id, ...patch } = payload
    if (!id) return NextResponse.json({ ok: false, error: 'id required' }, { status: 400 })
    if ('default_sections' in patch) patch.default_sections = cleanSections(patch.default_sections)
    const { error } = await dbUpdate('supervisors', { id }, patch)
    if (error) return NextResponse.json({ ok: false, error }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  if (action === 'delete') {
    const { error } = await dbDelete('supervisors', { id: payload.id })
    if (error) return NextResponse.json({ ok: false, error }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ ok: false, error: 'Unknown action' }, { status: 400 })
}
