import { NextRequest, NextResponse } from 'next/server'
import { dbSelect, dbInsert, dbUpdate, dbDelete, sb } from '@/lib/supabase'

export async function GET() {
  const { data, error } = await dbSelect('colour_chemicals',
    { order: 'name.asc', limit: '5000' },
    'id,name,created_at'
  )
  if (error) return NextResponse.json({ ok: false, error }, { status: 500 })
  return NextResponse.json({ ok: true, data, total: data.length })
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { action } = body

  if (action === 'create') {
    const { name } = body
    if (!name?.trim()) return NextResponse.json({ ok: false, error: 'name required' }, { status: 400 })
    const { data, error } = await dbInsert('colour_chemicals', { name: name.trim() })
    if (error) return NextResponse.json({ ok: false, error }, { status: 500 })
    return NextResponse.json({ ok: true, data })
  }

  if (action === 'update') {
    const { id, name } = body
    if (!id || !name?.trim()) return NextResponse.json({ ok: false, error: 'id and name required' }, { status: 400 })
    const { error } = await dbUpdate('colour_chemicals', { id }, { name: name.trim() })
    if (error) return NextResponse.json({ ok: false, error }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  if (action === 'delete') {
    const { id } = body
    if (!id) return NextResponse.json({ ok: false, error: 'id required' }, { status: 400 })
    const { error } = await dbDelete('colour_chemicals', { id })
    if (error) return NextResponse.json({ ok: false, error }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  if (action === 'bulk_insert') {
    const { names } = body // string[]
    if (!Array.isArray(names) || !names.length)
      return NextResponse.json({ ok: false, error: 'names[] required' }, { status: 400 })

    const rows = [...new Set(names.map((n: string) => n.trim()).filter(Boolean))]
      .map(name => ({ name }))

    const { error } = await sb('/colour_chemicals', {
      method:  'POST',
      body:    JSON.stringify(rows),
      headers: { 'Prefer': 'resolution=merge-duplicates,return=minimal' },
    })
    if (error) return NextResponse.json({ ok: false, error }, { status: 500 })
    return NextResponse.json({ ok: true, inserted: rows.length })
  }

  return NextResponse.json({ ok: false, error: 'Unknown action' }, { status: 400 })
}
