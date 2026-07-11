import { NextRequest, NextResponse } from 'next/server'
import { dbSelect, dbUpdate, sb, auditLog } from '@/lib/supabase'

export async function GET(req: NextRequest) {
  const type = new URL(req.url).searchParams.get('type')
  const query: Record<string, string> = { order: 'created_at.desc' }
  if (type) query['fob_type'] = `eq.${type}`

  const { data, error } = await dbSelect('fob_records', query,
    'id,batch_id,order_id,order_number,party,color,fob_kg,process_code,fob_type,status,notes,reported_by,created_at,updated_at'
  )
  if (error) return NextResponse.json({ ok: false, error }, { status: 500 })
  return NextResponse.json({ ok: true, data })
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { action, id, ...payload } = body

  if (action === 'update') {
    if (!id) return NextResponse.json({ ok: false, error: 'id required' }, { status: 400 })
    const patch: Record<string, any> = {}
    if (payload.status !== undefined) patch.status = payload.status
    if (payload.notes  !== undefined) patch.notes  = payload.notes
    const { error } = await dbUpdate('fob_records', { id }, patch)
    if (error) return NextResponse.json({ ok: false, error }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  if (action === 'delete') {
    if (!id) return NextResponse.json({ ok: false, error: 'id required' }, { status: 400 })
    const { error } = await sb('/fob_records', { method: 'DELETE', params: { id: `eq.${id}` } })
    if (error) return NextResponse.json({ ok: false, error }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ ok: false, error: 'Unknown action' }, { status: 400 })
}
