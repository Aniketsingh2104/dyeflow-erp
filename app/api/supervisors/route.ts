import { NextRequest, NextResponse } from 'next/server'
import { dbSelect, dbInsert, dbUpdate, dbDelete } from '@/lib/supabase'

export async function GET() {
  const { data, error } = await dbSelect('supervisors', { order: 'name.asc' },
    'id,name,articles,is_active,created_at')
  if (error) return NextResponse.json({ ok: false, error }, { status: 500 })
  return NextResponse.json({ ok: true, data })
}

export async function POST(req: NextRequest) {
  const { action, ...payload } = await req.json()

  if (action === 'create') {
    const { data, error } = await dbInsert('supervisors', payload)
    if (error) return NextResponse.json({ ok: false, error }, { status: 500 })
    return NextResponse.json({ ok: true, data })
  }

  if (action === 'update') {
    const { id, ...patch } = payload
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
