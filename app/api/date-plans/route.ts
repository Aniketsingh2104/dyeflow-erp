import { NextRequest, NextResponse } from 'next/server'
import { dbSelect, dbUpsert, sb } from '@/lib/supabase'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const batchId    = searchParams.get('batch_id')
    const batchIdStr = searchParams.get('batch_id_str')
    const query: Record<string, string> = { limit: '5000' }
    if (batchId)    query['batch_id']     = `eq.${batchId}`
    if (batchIdStr) query['batch_id_str'] = `eq.${batchIdStr}`
    const { data, error } = await dbSelect('batch_date_plans', query,
      'id,batch_id,batch_id_str,dates,anchors,' +
      'd_c,d_s,d_h,d_d,d_s2,d_rx,d_o,d_g,d_f,d_co,d_tu,d_add,d_level,d_rc,d_fix,d_wash,d_dry,d_b,d_r,d_k,d_qa,d_packing,d_dispatch,d_finaldispatch,' +
      'dc_generated_once,dc_regenerate,pushed,created_at,updated_at')
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

    // ── Upsert: save dates + anchors as JSONB ─────────────────────────────────
    if (action === 'upsert') {
      const { batch_id, batch_id_str, dates, anchors, dc_generated_once, dc_regenerate, pushed } = body
      const row: Record<string, any> = {
        batch_id, batch_id_str,
        dates:             dates   || {},
        anchors:           anchors || {},
        dc_generated_once: dc_generated_once ?? false,
        dc_regenerate:     dc_regenerate     ?? false,
        pushed:            pushed            ?? false,
        updated_at:        new Date().toISOString(),
      }
      const { data, error } = await dbUpsert('batch_date_plans', row, 'batch_id')
      if (error) return NextResponse.json({ ok: false, error }, { status: 500 })
      return NextResponse.json({ ok: true, data })
    }

    // ── Clear: wipe dates JSONB AND all fixed d_* columns, keep anchors ────────
    if (action === 'clear') {
      const { batch_id } = body
      const row: Record<string, any> = {
        batch_id,
        dates:             {},
        dc_generated_once: false,
        dc_regenerate:     false,
        pushed:            false,
        updated_at:        new Date().toISOString(),
        // Also clear all fixed d_* columns (legacy)
        d_c: null, d_s: null, d_h: null, d_d: null, d_s2: null,
        d_rx: null, d_o: null, d_g: null, d_f: null, d_co: null,
        d_tu: null, d_add: null, d_level: null, d_rc: null, d_fix: null,
        d_wash: null, d_dry: null, d_b: null, d_r: null, d_k: null,
        d_qa: null, d_packing: null, d_dispatch: null, d_finaldispatch: null,
      }
      const { data, error } = await dbUpsert('batch_date_plans', row, 'batch_id')
      if (error) return NextResponse.json({ ok: false, error }, { status: 500 })
      return NextResponse.json({ ok: true, data })
    }

    // ── Update anchors only (called from machine page) ────────────────────────
    if (action === 'update_anchors') {
      const { batch_id, batch_id_str, anchors } = body
      const row: Record<string, any> = {
        batch_id, batch_id_str,
        anchors:    anchors || {},
        updated_at: new Date().toISOString(),
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
