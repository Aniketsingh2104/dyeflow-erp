const fs = require('fs')

// ── Fix 1: Update /api/date-plans to use JSONB dates and anchors columns ──────
const apiContent = `import { NextRequest, NextResponse } from 'next/server'
import { dbSelect, dbUpsert, sb } from '@/lib/supabase'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const batchId    = searchParams.get('batch_id')
    const batchIdStr = searchParams.get('batch_id_str')
    const query: Record<string, string> = { limit: '5000' }
    if (batchId)    query['batch_id']     = \`eq.\${batchId}\`
    if (batchIdStr) query['batch_id_str'] = \`eq.\${batchIdStr}\`
    const { data, error } = await dbSelect('batch_date_plans', query,
      'id,batch_id,batch_id_str,dates,anchors,dc_generated_once,dc_regenerate,pushed,created_at,updated_at')
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

    // ── Clear: wipe dates but keep anchors ────────────────────────────────────
    if (action === 'clear') {
      const { batch_id } = body
      const row = {
        batch_id,
        dates:             {},
        dc_generated_once: false,
        dc_regenerate:     false,
        pushed:            false,
        updated_at:        new Date().toISOString(),
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
`
fs.mkdirSync('app/api/date-plans', { recursive: true })
fs.writeFileSync('app/api/date-plans/route.ts', apiContent, 'utf8')
console.log('✓ /api/date-plans updated to use JSONB dates and anchors')

// ── Fix 2: Update machine page to save anchors as JSONB ───────────────────────
const machinePath = 'app/machines/[machineId]/page.tsx'
let machine = fs.readFileSync(machinePath, 'utf8')

// Fix handleCollaborationConfirm anchor saves
const OLD_ANCHOR = `      return fetch('/api/date-plans', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'update_anchors', batch_id: uuid,
          batch_id_str: batchRow.batchId, anchors
        })
      }).catch(() => {})`

const NEW_ANCHOR = `      return fetch('/api/date-plans', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action:       'update_anchors',
          batch_id:     uuid,
          batch_id_str: batchRow.batchId,
          anchors       // JSONB: { S: '2026-08-04', D: '2026-08-07' }
        })
      }).catch(() => {})`

if (machine.includes(OLD_ANCHOR)) {
  machine = machine.replace(OLD_ANCHOR, NEW_ANCHOR)
  fs.writeFileSync(machinePath, machine, 'utf8')
  console.log('✓ Machine page anchor save updated')
} else {
  console.log('- Machine page anchor save already correct')
}

console.log('\n✓ API and machine page ready for dynamic Date Calculator')
