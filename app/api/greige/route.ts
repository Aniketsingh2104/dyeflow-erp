import { NextRequest, NextResponse } from 'next/server'
import { dbSelect, dbInsert, dbUpdate, sb } from '@/lib/supabase'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const id    = searchParams.get('id')
  const type  = searchParams.get('type') // entries | lots

  if (type === 'lots') {
    const query: Record<string, string> = { order: 'created_at.asc' }
    if (id) query['entry_id'] = `eq.${id}`
    const { data, error } = await dbSelect('greige_lots', query)
    if (error) return NextResponse.json({ ok: false, error }, { status: 500 })
    return NextResponse.json({ ok: true, data })
  }

  // entries (default)
  const query: Record<string, string> = { order: 'created_at.desc' }
  const { data, error } = await dbSelect(
    'greige_entries',
    query,
    'id,party,challan_no,no_of_taka,qty,article,blend,linked_order_id,lot_done_at,erp_done_at,sikka_done_at,created_at,updated_at,orders(order_number)'
  )
  if (error) return NextResponse.json({ ok: false, error }, { status: 500 })
  const enriched = (data || []).map((e: any) => ({
    ...e,
    linked_order_no: e.orders?.order_number || '',
  }))
  return NextResponse.json({ ok: true, data: enriched })
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { action, id, ...payload } = body

  if (action === 'create_entry') {
    const { data, error } = await dbInsert('greige_entries', {
      party:           payload.party,
      challan_no:      payload.challan,
      no_of_taka:      parseInt(payload.taka) || 0,
      qty:             payload.qty ? parseFloat(payload.qty) : null,
      article:         payload.article || null,
      blend:           payload.blend   || null,
      linked_order_id: payload.linkedOrderId || null,
    })
    if (error) return NextResponse.json({ ok: false, error }, { status: 500 })
    return NextResponse.json({ ok: true, data })
  }

  if (action === 'update_entry') {
    const patch: Record<string, any> = {}
    if (payload.lot_done_at   !== undefined) patch.lot_done_at   = payload.lot_done_at
    if (payload.erp_done_at   !== undefined) patch.erp_done_at   = payload.erp_done_at
    if (payload.sikka_done_at !== undefined) patch.sikka_done_at = payload.sikka_done_at
    const { error } = await dbUpdate('greige_entries', { id }, patch)
    if (error) return NextResponse.json({ ok: false, error }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  if (action === 'create_lot') {
    const { data, error } = await dbInsert('greige_lots', {
      entry_id:   payload.entryId,
      lot_number: payload.lotNumber,
      meters:     parseFloat(payload.meters) || 0,
      status:     payload.status || 'pending',
      notes:      payload.notes || null,
    })
    if (error) return NextResponse.json({ ok: false, error }, { status: 500 })

    // Mark lot_done_at on the entry
    await dbUpdate('greige_entries', { id: payload.entryId }, {
      lot_done_at: new Date().toISOString()
    })

    return NextResponse.json({ ok: true, data })
  }

  if (action === 'update_lot') {
    const patch: Record<string, any> = {}
    if (payload.status !== undefined) patch.status = payload.status
    if (payload.notes  !== undefined) patch.notes  = payload.notes
    const { error } = await dbUpdate('greige_lots', { id }, patch)
    if (error) return NextResponse.json({ ok: false, error }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ ok: false, error: 'Unknown action' }, { status: 400 })
}
