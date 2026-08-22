const fs = require('fs')
const filePath = 'app/api/batches/route.ts'
let c = fs.readFileSync(filePath, 'utf8')

const OLD = `    if (action === 'mark_faulty') {
      const { batch_id, order_id, faulty_type, faulty_kg, process_code, order_number, party } = payload
      await dbUpdate('batches', { id: batch_id }, { is_faulty: true, status: 'faulty' })
      const { data, error } = await dbInsert('faulty_records', {
        batch_id, order_id, order_number, party,
        faulty_type, faulty_kg, process_code, status: 'open',
      })
      if (error) return NextResponse.json({ ok: false, error }, { status: 500 })
      await auditLog({ username: _user, action: 'faulty_mark', entity_type: 'batch',
        entity_id: batch_id, new_value: faulty_type })
      return NextResponse.json({ ok: true, data })
    }`

const NEW = `    if (action === 'mark_faulty') {
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

if (c.includes(OLD)) {
  c = c.replace(OLD, NEW)
  fs.writeFileSync(filePath, c, 'utf8')
  console.log('✓ mark_faulty now:')
  console.log('  1. Clears current_process → batch leaves FMS page')
  console.log('  2. Sets batch_processes.done_at → Actual Date shows')
  console.log('  3. Creates faulty_record → batch appears on Faulty page')
} else {
  console.error('✗ Pattern not found')
}
