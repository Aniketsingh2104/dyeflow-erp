const fs = require('fs')
const filePath = 'app/api/batches/route.ts'
let c = fs.readFileSync(filePath, 'utf8')

// Add reset_process action to batches API
const OLD_UNKNOWN = `    return NextResponse.json({ ok: false, error: 'Unknown action' }, { status: 400 })`

const NEW_RESET = `    // ── Reset a process step so batch can be marked done again ─────────────
    if (action === 'reset_process') {
      const { batch_id, process_code } = payload
      if (!batch_id || !process_code) {
        return NextResponse.json({ ok: false, error: 'batch_id and process_code required' }, { status: 400 })
      }
      // Clear done_at and set status back to pending for this process step
      const { data, error } = await sb('/batch_processes', {
        method: 'PATCH',
        body: JSON.stringify({ status: 'pending', done_at: null }),
        params: { batch_id: \`eq.\${batch_id}\`, process_code: \`eq.\${process_code}\` },
        headers: { 'Prefer': 'return=representation' },
      })
      if (error) return NextResponse.json({ ok: false, error }, { status: 500 })
      return NextResponse.json({ ok: true, data })
    }

    return NextResponse.json({ ok: false, error: 'Unknown action' }, { status: 400 })`

if (c.includes(OLD_UNKNOWN)) {
  c = c.replace(OLD_UNKNOWN, NEW_RESET)
  fs.writeFileSync(filePath, c, 'utf8')
  console.log('✓ Added reset_process action to batches API')
} else console.error('✗ Unknown action pattern not found')
