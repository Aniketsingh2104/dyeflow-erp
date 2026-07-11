import { NextRequest, NextResponse } from 'next/server'
import { dbSelect, dbInsert, dbUpdate, sb } from '@/lib/supabase'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')

  if (id) {
    const { data, error } = await dbSelect('order_sheets', { id: `eq.${id}` })
    if (error) return NextResponse.json({ ok: false, error }, { status: 500 })
    return NextResponse.json({ ok: true, data: data[0] || null })
  }

  const { data, error } = await dbSelect('order_sheets', { order: 'created_at.desc' })
  if (error) return NextResponse.json({ ok: false, error }, { status: 500 })
  return NextResponse.json({ ok: true, data })
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { action, ...payload } = body

  if (action === 'create') {
    const { data, error } = await dbInsert('order_sheets', {
      title:       payload.title,
      assigned_to: payload.assignedTo,
      status:      'Active',
      rows:        payload.rows || [],
    })
    if (error) return NextResponse.json({ ok: false, error }, { status: 500 })
    return NextResponse.json({ ok: true, data })
  }

  if (action === 'update_rows') {
    const { id, rows } = payload
    if (!id) return NextResponse.json({ ok: false, error: 'id required' }, { status: 400 })
    const { error } = await dbUpdate('order_sheets', { id }, { rows })
    if (error) return NextResponse.json({ ok: false, error }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  if (action === 'toggle_status') {
    const { id, status } = payload
    const { error } = await dbUpdate('order_sheets', { id }, { status })
    if (error) return NextResponse.json({ ok: false, error }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  if (action === 'delete') {
    const { error } = await sb('/order_sheets', {
      method: 'DELETE',
      params: { id: `eq.${payload.id}` },
    })
    if (error) return NextResponse.json({ ok: false, error }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ ok: false, error: 'Unknown action' }, { status: 400 })
}
