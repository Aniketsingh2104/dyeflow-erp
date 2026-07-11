import { NextRequest, NextResponse } from 'next/server'
import { dbSelect, dbInsert, dbUpdate, dbDelete } from '@/lib/supabase'

export async function GET() {
  const { data, error } = await dbSelect('machines', { order: 'name.asc' },
    'id,name,capacity,status,machine_type,is_active,created_at')
  if (error) return NextResponse.json({ ok: false, error }, { status: 500 })
  return NextResponse.json({ ok: true, data })
}

export async function POST(req: NextRequest) {
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
