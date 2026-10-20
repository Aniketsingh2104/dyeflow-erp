import { NextRequest, NextResponse } from 'next/server'
import { guard } from '@/lib/access'
import { dbSelect, dbUpsert, sb } from '@/lib/supabase'
import { DATE_COL, dateColFor, anchorColFor } from '@/lib/processCodes'

// Process code → column mapping lives in lib/processCodes.ts (one standard:
// 'Lev' → d_level / anchor_lev, 'Qa' → d_qa; old 'Level' / 'QA' still accepted).
const PROC_COLS = DATE_COL

export async function GET(req: NextRequest) {
  { const g = await guard(req, 'date-plans', 'GET'); if (g.deny) return g.deny }
  try {
    const { searchParams } = new URL(req.url)
    const batchId = searchParams.get('batch_id')       // uuid
    const batchIdStr = searchParams.get('batch_id_str') // e.g. DYE26-0004-B1

    // every plan (dbSelect pages past the 1,000-row server limit) — the old
    // 5,000 cap made Generate overwrite plans it had never loaded
    const query: Record<string, string> = { order: 'batch_id.asc' }
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
    { const g = await guard(req, 'date-plans', (body as any)?.action); if (g.deny) return g.deny }
    const { action } = body

    // ── Upsert date plan for a batch ──────────────────────────────────────
    if (action === 'upsert') {
      const { batch_id, batch_id_str, dates, anchors, dc_generated_once, dc_regenerate, pushed } = body

      // flags only when sent — leaving one out keeps what is saved
      const row: Record<string, any> = { batch_id, batch_id_str, updated_at: new Date().toISOString() }
      if (dc_generated_once !== undefined) row.dc_generated_once = !!dc_generated_once
      if (dc_regenerate     !== undefined) row.dc_regenerate     = !!dc_regenerate
      if (pushed            !== undefined) row.pushed            = !!pushed

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
          if (!col) continue
          const v = String(isoDate || '').slice(0, 10)
          if (v && !/^\d{4}-\d{2}-\d{2}$/.test(v)) {
            return NextResponse.json({ ok: false, error: `"${isoDate}" is not a date (expected yyyy-mm-dd)` }, { status: 400 })
          }
          row[col] = v || null
        }
      }

      const { data, error } = await dbUpsert('batch_date_plans', row, 'batch_id')
      if (error) return NextResponse.json({ ok: false, error }, { status: 500 })
      return NextResponse.json({ ok: true, data })
    }

    // ── Generate Dates: many rows in one call ─────────────────────────────
    // rows = [{ batch_id, batch_id_str, dates, dc_generated_once, dc_regenerate, pushed }]
    // Every row carries the same columns (all date columns + flags), so the
    // whole list is ONE upsert — all saved or none. Anchors are never touched.
    if (action === 'bulk_upsert') {
      const list: any[] = Array.isArray(body.rows) ? body.rows : []
      if (!list.length) return NextResponse.json({ ok: false, error: 'rows required' }, { status: 400 })
      if (list.length > 2000) return NextResponse.json({ ok: false, error: 'Too many rows at once (max 2000)' }, { status: 400 })
      const dateCols = [...new Set(Object.values(PROC_COLS))]
      const now = new Date().toISOString()
      const out: Record<string, any>[] = []
      for (const r of list) {
        if (!r?.batch_id || !/^[0-9a-f-]{36}$/i.test(String(r.batch_id))) {
          return NextResponse.json({ ok: false, error: 'Every row needs a valid batch_id' }, { status: 400 })
        }
        const row: Record<string, any> = {
          batch_id: r.batch_id, batch_id_str: r.batch_id_str ?? null, updated_at: now,
          dc_generated_once: !!r.dc_generated_once, dc_regenerate: !!r.dc_regenerate, pushed: !!r.pushed,
        }
        for (const c of dateCols) row[c] = null
        for (const [proc, isoDate] of Object.entries((r.dates || {}) as Record<string, string>)) {
          const col = dateColFor(proc)
          if (!col) continue
          const v = String(isoDate || '').slice(0, 10)
          if (v && !/^\d{4}-\d{2}-\d{2}$/.test(v)) {
            return NextResponse.json({ ok: false, error: `${r.batch_id_str || r.batch_id}: "${isoDate}" is not a date` }, { status: 400 })
          }
          row[col] = v || null
        }
        out.push(row)
      }
      const { error } = await sb('/batch_date_plans?on_conflict=batch_id', {
        method: 'POST', body: JSON.stringify(out),
        headers: { 'Prefer': 'resolution=merge-duplicates,return=minimal' },
      })
      if (error) return NextResponse.json({ ok: false, error }, { status: 500 })
      return NextResponse.json({ ok: true, saved: out.length })
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
