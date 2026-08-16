import { NextRequest, NextResponse } from 'next/server'
import { dbSelect, dbInsert, dbUpdate, auditLog } from '@/lib/supabase'

export async function GET() {
  const { data, error } = await dbSelect('fob_records', { order: 'created_at.desc', limit: '2000' }, '*')
  if (error) return NextResponse.json({ ok: false, error }, { status: 500 })
  return NextResponse.json({ ok: true, data })
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { action, id, ...payload } = body

  if (action === 'create') {
    const { data, error } = await dbInsert('fob_records', {
      batch_id:     payload.batch_id,
      order_id:     payload.order_id,
      order_number: payload.order_number,
      party:        payload.party,
      fob_kg:       payload.fob_kg || 0,
      process_code: payload.process_code,
      fob_type:     payload.fob_type || 'dyeing',
      status:       'open',
      notes:        payload.notes || '',
    })
    if (error) return NextResponse.json({ ok: false, error }, { status: 500 })
    await auditLog({ action: 'fob_create', entity_type: 'fob_record', entity_id: payload.batch_id, new_value: payload.fob_type })
    return NextResponse.json({ ok: true, data })
  }

  if (action === 'update') {
    if (!id) return NextResponse.json({ ok: false, error: 'id required' }, { status: 400 })
    const { error } = await dbUpdate('fob_records', { id }, payload)
    if (error) return NextResponse.json({ ok: false, error }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ ok: false, error: 'Unknown action' }, { status: 400 })
}
