const fs = require('fs')

// ── Fix 1: mark_faulty API — use RPC for batch_processes update + save color ──
const apiPath = 'app/api/batches/route.ts'
let api = fs.readFileSync(apiPath, 'utf8')

const OLD_FAULTY = `    if (action === 'mark_faulty') {
      const { batch_id, order_id, faulty_type, faulty_kg, process_code, order_number, party } = payload
      const now = new Date().toISOString()

      // 1. Update batch: faulty status + clear current_process so it leaves FMS page
      await dbUpdate('batches', { id: batch_id }, {
        is_faulty:       true,
        status:          'faulty',
        current_process: null,   // remove from process page
      })

      // 2. Set done_at on batch_processes for this process so Actual Date shows
      await sb('/batch_processes', {
        method: 'PATCH',
        body: JSON.stringify({ status: 'faulty', done_at: now }),
        params: { batch_id: \`eq.\${batch_id}\`, process_code: \`eq.\${process_code}\` },
        headers: { 'Prefer': 'return=minimal' },
      })

      // 3. Create faulty record
      const { data, error } = await dbInsert('faulty_records', {
        batch_id, order_id, order_number, party,
        faulty_type, faulty_kg, process_code,
        status: 'open',
        created_at: now,
      })
      if (error) return NextResponse.json({ ok: false, error }, { status: 500 })

      await auditLog({ username: _user, action: 'faulty_mark', entity_type: 'batch',
        entity_id: batch_id, new_value: faulty_type })
      return NextResponse.json({ ok: true, data })
    }`

const NEW_FAULTY = `    if (action === 'mark_faulty') {
      const { batch_id, order_id, faulty_type, faulty_kg, process_code, order_number, party, color } = payload
      const now = new Date().toISOString()

      // 1. Update batch: faulty status + clear current_process so it leaves FMS page
      await dbUpdate('batches', { id: batch_id }, {
        is_faulty:       true,
        status:          'faulty',
        current_process: null,
      })

      // 2. Set done_at on batch_processes using RPC (reliable composite key update)
      await sb('/rpc/mark_process_faulty', {
        method: 'POST',
        body: JSON.stringify({ p_batch_id: batch_id, p_process_code: process_code, p_done_at: now }),
      })

      // 3. Create faulty record with color
      const { data, error } = await dbInsert('faulty_records', {
        batch_id, order_id, order_number, party, color: color || null,
        faulty_type, faulty_kg, process_code,
        status: 'open',
      })
      if (error) return NextResponse.json({ ok: false, error }, { status: 500 })

      await auditLog({ username: _user, action: 'faulty_mark', entity_type: 'batch',
        entity_id: batch_id, new_value: faulty_type })
      return NextResponse.json({ ok: true, data })
    }`

if (api.includes(OLD_FAULTY)) {
  api = api.replace(OLD_FAULTY, NEW_FAULTY)
  fs.writeFileSync(apiPath, api, 'utf8')
  console.log('✓ mark_faulty uses RPC + saves color')
} else console.error('✗ mark_faulty pattern not found')

// ── Fix 2: FMS page — pass color in handleFaulty + fix isDoneHere to include faulty status ──
const fmsPath = 'app/fms/[process]/page.tsx'
let fms = fs.readFileSync(fmsPath, 'utf8')

// Fix isDoneHere to include faulty status
const OLD_DONE_HERE = `        // Done here: batch_processes has a done entry for this process code
        const isDoneHere = (b.batch_processes || []).some((bp: any) =>
          (bp.process_code?.toUpperCase() === processCode || bp.process_code === processCode) &&
          bp.status === 'done'
        )`

const NEW_DONE_HERE = `        // Done/faulty here: batch_processes has done or faulty entry for this process code
        const isDoneHere = (b.batch_processes || []).some((bp: any) =>
          (bp.process_code?.toUpperCase() === processCode || bp.process_code === processCode) &&
          (bp.status === 'done' || bp.status === 'faulty')
        )`

if (fms.includes(OLD_DONE_HERE)) {
  fms = fms.replace(OLD_DONE_HERE, NEW_DONE_HERE)
  console.log('✓ isDoneHere now includes faulty status')
} else console.error('✗ isDoneHere pattern not found')

// Fix handleFaulty to pass color
const OLD_FAULTY_CALL = `      const { error } = await markBatchFaulty({
        batch_id:    row.id,
        order_id:    row.order_id,
        order_number: row.orderNo,
        party:        row.party,
        faulty_type:  faultyReason,
        faulty_kg:    parseFloat(row.kg) || 0,
        process_code: processCode,
      })`

const NEW_FAULTY_CALL = `      const { error } = await markBatchFaulty({
        batch_id:    row.id,
        order_id:    row.order_id,
        order_number: row.orderNo,
        party:        row.party,
        color:        row.color,
        faulty_type:  faultyReason,
        faulty_kg:    parseFloat(row.kg) || 0,
        process_code: processCode,
      })`

if (fms.includes(OLD_FAULTY_CALL)) {
  fms = fms.replace(OLD_FAULTY_CALL, NEW_FAULTY_CALL)
  console.log('✓ handleFaulty passes color')
} else console.error('✗ handleFaulty call pattern not found')

// Fix isCompleted to also handle faulty
const OLD_COMPLETED = `          // isCompleted: only true if this specific process step is marked done
          // bp.status must be 'done' — if reset_process ran, it's 'pending'
          isCompleted:     bp?.status === 'done',`

const NEW_COMPLETED = `          // isCompleted: true if process step is done OR faulty
          isCompleted:     bp?.status === 'done' || bp?.status === 'faulty',`

if (fms.includes(OLD_COMPLETED)) {
  fms = fms.replace(OLD_COMPLETED, NEW_COMPLETED)
  console.log('✓ isCompleted includes faulty status')
} else console.error('✗ isCompleted pattern not found')

fs.writeFileSync(fmsPath, fms, 'utf8')

// ── Fix 3: markBatchFaulty in lib/db.ts — add color field ────────────────────
const dbPath = 'lib/db.ts'
let db = fs.readFileSync(dbPath, 'utf8')

const OLD_MARK = `export async function markBatchFaulty(payload: {
  batch_id: string; order_id: string; order_number: string; party: string;
  faulty_type: string; faulty_kg: number; process_code: string;
})`

const NEW_MARK = `export async function markBatchFaulty(payload: {
  batch_id: string; order_id: string; order_number: string; party: string;
  color?: string; faulty_type: string; faulty_kg: number; process_code: string;
})`

if (db.includes(OLD_MARK)) {
  db = db.replace(OLD_MARK, NEW_MARK)
  fs.writeFileSync(dbPath, db, 'utf8')
  console.log('✓ markBatchFaulty signature includes color')
} else console.error('✗ markBatchFaulty signature not found')

console.log('\n✓ All fixes done')
