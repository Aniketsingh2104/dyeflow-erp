import { NextRequest, NextResponse } from 'next/server'
import { dbSelect, dbInsert, sb } from '@/lib/supabase'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const limit  = parseInt(searchParams.get('limit')  || '500')
  const action = searchParams.get('action')
  const entity = searchParams.get('entity')

  const query: Record<string, string> = {
    order: 'created_at.desc',
    limit: String(Math.min(limit, 2000)),
  }
  if (action) query['action']      = `eq.${action}`
  if (entity) query['entity_type'] = `eq.${entity}`

  const { data, error } = await dbSelect('audit_log', query)
  if (error) return NextResponse.json({ ok: false, error }, { status: 500 })
  return NextResponse.json({ ok: true, data })
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { action } = body

  if (action === 'log') {
    const { error } = await dbInsert('audit_log', {
      id:          body.id,
      user:        body.user || 'System',
      action:      body.action_type,
      entity_type: body.entity_type,
      entity_id:   body.entity_id,
      field:       body.field       || null,
      old_value:   body.old_value   || null,
      new_value:   body.new_value   || null,
      note:        body.note        || null,
    })
    if (error) return NextResponse.json({ ok: false, error }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  if (action === 'clear') {
    const { error } = await sb('/audit_log', {
      method: 'DELETE',
      params: { id: 'neq.never' }, // delete all rows
    })
    if (error) return NextResponse.json({ ok: false, error }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ ok: false, error: 'Unknown action' }, { status: 400 })
}
