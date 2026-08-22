const fs = require('fs')
const filePath = 'app/api/batches/route.ts'
let c = fs.readFileSync(filePath, 'utf8')

const OLD = `    // ── Reset a process step so batch can be marked done again ─────────────
    if (action === 'reset_process') {
      const { batch_id, process_code } = payload
      if (!batch_id || !process_code) {
        return NextResponse.json({ ok: false, error: 'batch_id and process_code required' }, { status: 400 })
      }
      // PATCH batch_processes where batch_id=UUID AND process_code=code
      // Must use query params for both filters
      const { error } = await sb('/batch_processes', {
        method: 'PATCH',
        body: JSON.stringify({ status: 'pending', done_at: null }),
        params: {
          batch_id:     \`eq.\${batch_id}\`,
          process_code: \`eq.\${process_code}\`,
        },
        headers: { 'Prefer': 'return=minimal' },
      })
      if (error) return NextResponse.json({ ok: false, error }, { status: 500 })
      return NextResponse.json({ ok: true })
    }`

const NEW = `    // ── Reset a process step so batch can be marked done again ─────────────
    if (action === 'reset_process') {
      const { batch_id, process_code } = payload
      if (!batch_id || !process_code) {
        return NextResponse.json({ ok: false, error: 'batch_id and process_code required' }, { status: 400 })
      }
      // Use Supabase RPC for reliable composite key update
      const { error } = await sb('/rpc/reset_batch_process', {
        method: 'POST',
        body: JSON.stringify({ p_batch_id: batch_id, p_process_code: process_code }),
      })
      if (error) return NextResponse.json({ ok: false, error }, { status: 500 })
      return NextResponse.json({ ok: true })
    }`

if (c.includes(OLD)) {
  c = c.replace(OLD, NEW)
  fs.writeFileSync(filePath, c, 'utf8')
  console.log('✓ reset_process now uses Supabase RPC function')
} else console.error('✗ Pattern not found')
