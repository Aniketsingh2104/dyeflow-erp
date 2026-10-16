import { NextRequest, NextResponse } from 'next/server'
import { dbSelect, dbUpsert } from '@/lib/supabase'
import { DATE_COL, dateColFor, anchorColFor } from '@/lib/processCodes'

// Process code → column mapping lives in lib/processCodes.ts (one standard:
// 'Lev' → d_level / anchor_lev, 'Qa' → d_qa; old 'Level' / 'QA' still accepted).
const PROC_COLS = DATE_COL

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const batchId = searchParams.get('batch_id')       // uuid
    const batchIdStr = searchParams.get('batch_id_str') // e.g. DYE26-0004-B1

    const query: Record<string, string> = { limit: '5000' }
    if (batchId)    query['batch_id']     = `eq.${batchId}`
    if (batchIdStr) query['batch_id_str'] = `eq.${batchIdStr}`

    const { data, error } = await dbSelect('batch_date_plans', query, '*')
    if (error) return NextResponse.json({ ok: false, error }, { status: 500 })
    return NextResponse.json({ ok: true, data: data || [] })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { action } = body

    // ── Upsert date plan for a batch ──────────────────────────────────────
    if (action === 'upsert') {
      const { batch_id, batch_id_str, dates, anchors, dc_generated_once, dc_regenerate, pushed } = body

      const row: Record<string, any> = {
        batch_id,
        batch_id_str,
        dc_generated_once: dc_generated_once ?? false,
        dc_regenerate:     dc_regenerate     ?? false,
        pushed:            pushed            ?? false,
        updated_at:        new Date().toISOString(),
      }

      // Map anchor dates: { S: '2026-08-04', D: '2026-08-07' }
      if (anchors) {
        for (const [proc, isoDate] of Object.entries(anchors)) {
          const col = anchorColFor(proc)
          if (col) row[col] = isoDate || null
        }
      }

      // Map generated dates: { C: '2026-08-06', S: '2026-08-07', D: '2026-08-09', ... }
      if (dates) {
        for (const [proc, isoDate] of Object.entries(dates)) {
          const col = dateColFor(proc)
          if (col) row[col] = isoDate || null
        }
      }

      const { data, error } = await dbUpsert('batch_date_plans', row, 'batch_id')
      if (error) return NextResponse.json({ ok: false, error }, { status: 500 })
      return NextResponse.json({ ok: true, data })
    }

    // ── Clear date plan (keep anchors, wipe generated dates) ──────────────
    if (action === 'clear') {
      const { batch_id } = body
      const clearRow: Record<string, any> = { batch_id, dc_generated_once: false, dc_regenerate: false, updated_at: new Date().toISOString() }
      for (const col of Object.values(PROC_COLS)) clearRow[col] = null
      const { data, error } = await dbUpsert('batch_date_plans', clearRow, 'batch_id')
      if (error) return NextResponse.json({ ok: false, error }, { status: 500 })
      return NextResponse.json({ ok: true, data })
    }

    // ── Update anchor dates only (called from machine page) ───────────────
    if (action === 'update_anchors') {
      const { batch_id, batch_id_str, anchors } = body
      const row: Record<string, any> = { batch_id, batch_id_str, updated_at: new Date().toISOString() }
      for (const [proc, isoDate] of Object.entries(anchors as Record<string, string>)) {
        const col = anchorColFor(proc)
        if (col) row[col] = isoDate || null
      }
      const { data, error } = await dbUpsert('batch_date_plans', row, 'batch_id')
      if (error) return NextResponse.json({ ok: false, error }, { status: 500 })
      return NextResponse.json({ ok: true, data })
    }

    return NextResponse.json({ ok: false, error: 'Unknown action' }, { status: 400 })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}
