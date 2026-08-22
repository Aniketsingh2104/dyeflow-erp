const fs = require('fs')

// Fix 1: Create /api/fob route if not exists
const fobApiDir = 'app/api/fob'
if (!fs.existsSync(fobApiDir)) fs.mkdirSync(fobApiDir, { recursive: true })

fs.writeFileSync(`${fobApiDir}/route.ts`, `import { NextRequest, NextResponse } from 'next/server'
import { dbSelect, dbInsert, dbUpdate, auditLog } from '@/lib/supabase'

export async function GET() {
  const { data, error } = await dbSelect('fob_records', { order: 'created_at.desc', limit: '2000' }, '*')
  if (error) return NextResponse.json({ ok: false, error }, { status: 500 })
  return NextResponse.json({ ok: true, data })
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { action, id, ...payload } = body

  if (action === 'create') {
    const { data, error } = await dbInsert('fob_records', {
      batch_id:     payload.batch_id,
      order_id:     payload.order_id,
      order_number: payload.order_number,
      party:        payload.party,
      fob_kg:       payload.fob_kg || 0,
      process_code: payload.process_code,
      fob_type:     payload.fob_type || 'dyeing',
      status:       'open',
      notes:        payload.notes || '',
    })
    if (error) return NextResponse.json({ ok: false, error }, { status: 500 })
    await auditLog({ action: 'fob_create', entity_type: 'fob_record', entity_id: payload.batch_id, new_value: payload.fob_type })
    return NextResponse.json({ ok: true, data })
  }

  if (action === 'update') {
    if (!id) return NextResponse.json({ ok: false, error: 'id required' }, { status: 400 })
    const { error } = await dbUpdate('fob_records', { id }, payload)
    if (error) return NextResponse.json({ ok: false, error }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ ok: false, error: 'Unknown action' }, { status: 400 })
}
`)
console.log('✓ Created /api/fob/route.ts')

// Fix 2: FMS page — replace sb('/fob_records'...) with fetch('/api/fob')
const fmsPath = 'app/fms/[process]/page.tsx'
let fms = fs.readFileSync(fmsPath, 'utf8')

const OLD_FOB = `      const { error } = await sb('/fob_records', {
        method: 'POST',
        body: JSON.stringify({
          batch_id:    row.id,
          order_id:    row.order_id,
          order_number: row.orderNo,
          party:        row.party,
          fob_kg:       parseFloat(row.kg) || 0,
          process_code: processCode,
          fob_type:     fobType,
          status:       'open',
          notes:        fobReason,
        }),
        headers: { 'Prefer': 'return=minimal' },
      })
      if (error) { alert('Error: ' + error); return }`

const NEW_FOB = `      const fobRes = await fetch('/api/fob', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action:       'create',
          batch_id:     row.id,
          order_id:     row.order_id,
          order_number: row.orderNo,
          party:        row.party,
          fob_kg:       parseFloat(row.kg) || 0,
          process_code: processCode,
          fob_type:     fobType,
          notes:        fobReason,
        }),
      }).then(r => r.json())
      if (!fobRes.ok) { alert('Error: ' + fobRes.error); return }`

if (fms.includes(OLD_FOB)) {
  fms = fms.replace(OLD_FOB, NEW_FOB)
  // Remove the sb import since it's no longer used in this file
  fms = fms.replace(`import { sb } from '@/lib/supabase'\n`, '')
  fs.writeFileSync(fmsPath, fms, 'utf8')
  console.log('✓ handleFob now calls /api/fob instead of sb() directly')
  console.log('✓ Removed unused sb import from FMS page')
} else {
  console.error('✗ FOB pattern not found')
}
