import { NextRequest, NextResponse } from 'next/server'
import { dbSelect, dbInsert, dbUpdate, dbDelete, sb } from '@/lib/supabase'

export async function GET() {
  const { data, error } = await dbSelect('shade_master',
    { order: 'shade_name.asc', limit: '5000' },
    'id,shade_name,shade_group,created_at'
  )
  if (error) return NextResponse.json({ ok: false, error }, { status: 500 })
  return NextResponse.json({ ok: true, data, total: data.length })
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { action } = body

  if (action === 'create') {
    const { shade_name, shade_group } = body
    if (!shade_name?.trim() || !shade_group?.trim())
      return NextResponse.json({ ok: false, error: 'shade_name and shade_group required' }, { status: 400 })
    const { data, error } = await dbInsert('shade_master',
      { shade_name: shade_name.trim(), shade_group: shade_group.trim() })
    if (error) return NextResponse.json({ ok: false, error }, { status: 500 })
    return NextResponse.json({ ok: true, data })
  }

  if (action === 'update') {
    const { id, shade_name, shade_group } = body
    if (!id) return NextResponse.json({ ok: false, error: 'id required' }, { status: 400 })
    const { error } = await dbUpdate('shade_master', { id },
      { shade_name: shade_name?.trim(), shade_group: shade_group?.trim() })
    if (error) return NextResponse.json({ ok: false, error }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  if (action === 'delete') {
    const { id } = body
    if (!id) return NextResponse.json({ ok: false, error: 'id required' }, { status: 400 })
    const { error } = await dbDelete('shade_master', { id })
    if (error) return NextResponse.json({ ok: false, error }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  if (action === 'bulk_insert') {
    // [{ shade_name, shade_group }]
    const { rules } = body
    if (!Array.isArray(rules) || !rules.length)
      return NextResponse.json({ ok: false, error: 'rules[] required' }, { status: 400 })
    const rows = rules
      .filter(r => r.shade_name?.trim() && r.shade_group?.trim())
      .map(r => ({ shade_name: r.shade_name.trim(), shade_group: r.shade_group.trim() }))
    if (!rows.length) return NextResponse.json({ ok: false, error: 'No valid rows' }, { status: 400 })
    const { error } = await sb('/shade_master', {
      method: 'POST', body: JSON.stringify(rows),
      headers: { 'Prefer': 'resolution=merge-duplicates,return=minimal' },
    })
    if (error) return NextResponse.json({ ok: false, error }, { status: 500 })
    return NextResponse.json({ ok: true, inserted: rows.length })
  }

  return NextResponse.json({ ok: false, error: 'Unknown action' }, { status: 400 })
}
