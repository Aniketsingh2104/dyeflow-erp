import { NextRequest, NextResponse } from 'next/server'
import { guard } from '@/lib/access'
import { dbSelect, dbInsert, dbUpdate, dbDelete, sb } from '@/lib/supabase'
import { requireAdmin } from '@/lib/auth'

export async function GET(req: NextRequest) {
  { const g = await guard(req, 'colour-chemicals', 'GET'); if (g.deny) return g.deny }
  const { data, error } = await dbSelect('colour_chemicals',
    { order: 'name.asc', limit: '5000' },
    'id,name,type,unit,notes,rate,lead_time,safety_factor,avg_daily_consumption,created_at'
  )
  if (error) return NextResponse.json({ ok: false, error }, { status: 500 })
  return NextResponse.json({ ok: true, data, total: data.length })
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  { const g = await guard(req, 'colour-chemicals', (body as any)?.action); if (g.deny) return g.deny }
  const { action } = body

  // Master edits (names and the planning values) are admin only — they are
  // entered on Setup → Colour Chemical Master; the IMS page only shows them.
  { const deny = await requireAdmin(req); if (deny) return deny }

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

  // Reorder-planning inputs (Lead Time, Safety Factor, Avg Daily Consumption)
  // — MAX Level is computed from these on the client, not stored.
  if (action === 'update_planning') {
    const { id, leadTime, safetyFactor, avgDailyConsumption, rate, type } = body
    if (!id) return NextResponse.json({ ok: false, error: 'id required' }, { status: 400 })
    const patch: Record<string, any> = {}
    if (rate !== undefined) patch.rate = rate === '' || rate === null ? null : parseFloat(rate)
    if (type !== undefined) patch.type = type ? String(type).trim() : null
    if (leadTime !== undefined) patch.lead_time = leadTime === '' ? null : parseFloat(leadTime)
    if (safetyFactor !== undefined) patch.safety_factor = safetyFactor === '' ? null : parseFloat(safetyFactor)
    if (avgDailyConsumption !== undefined) patch.avg_daily_consumption = avgDailyConsumption === '' ? null : parseFloat(avgDailyConsumption)
    const { error } = await dbUpdate('colour_chemicals', { id }, patch)
    if (error) return NextResponse.json({ ok: false, error }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  // Excel import on Colour Chemical Master: rows [{ name, type, rate, leadTime, safetyFactor, avgDailyConsumption }]
  // — existing names are updated with the values given, new names are created.
  if (action === 'bulk_upsert_planning') {
    const { rows } = body
    if (!Array.isArray(rows) || !rows.length) return NextResponse.json({ ok: false, error: 'rows[] required' }, { status: 400 })
    const num = (v: any) => { if (v === undefined) return undefined; if (v === null || v === '') return null; const n = parseFloat(v); return isFinite(n) ? n : null }
    const seen = new Set<string>()
    const clean = rows.map((r: any) => {
      const name = String(r.name || '').trim(); if (!name || seen.has(name.toLowerCase())) return null
      seen.add(name.toLowerCase())
      const o: Record<string, any> = { name }
      const lt = num(r.leadTime), sf = num(r.safetyFactor), ad = num(r.avgDailyConsumption), rt = num(r.rate)
      if (r.type !== undefined) o.type = r.type === null || String(r.type).trim() === '' ? null : String(r.type).trim()
      if (rt !== undefined) o.rate = rt
      if (lt !== undefined) o.lead_time = lt
      if (sf !== undefined) o.safety_factor = sf
      if (ad !== undefined) o.avg_daily_consumption = ad
      return o
    }).filter(Boolean) as Record<string, any>[]
    if (!clean.length) return NextResponse.json({ ok: false, error: 'No names in the file' }, { status: 400 })
    // upsert by name; columns missing in a row keep their current value (merge-duplicates
    // only overwrites the columns sent, and every row carries the same columns, so send all)
    const cols = ['type', 'rate', 'lead_time', 'safety_factor', 'avg_daily_consumption'].filter(c => clean.some(r => c in r))
    const uniform = clean.map(r => { const o: Record<string, any> = { name: r.name }; for (const c of cols) o[c] = r[c] ?? null; return o })
    const { error } = await sb('/colour_chemicals?on_conflict=name', {
      method: 'POST', body: JSON.stringify(uniform),
      headers: { 'Prefer': 'resolution=merge-duplicates,return=minimal' },
    })
    if (error) return NextResponse.json({ ok: false, error }, { status: 500 })
    return NextResponse.json({ ok: true, count: uniform.length })
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

    const { error } = await sb('/colour_chemicals?on_conflict=name', {
      method:  'POST',
      body:    JSON.stringify(rows),
      headers: { 'Prefer': 'resolution=merge-duplicates,return=minimal' },
    })
    if (error) return NextResponse.json({ ok: false, error }, { status: 500 })
    return NextResponse.json({ ok: true, inserted: rows.length })
  }

  return NextResponse.json({ ok: false, error: 'Unknown action' }, { status: 400 })
}
