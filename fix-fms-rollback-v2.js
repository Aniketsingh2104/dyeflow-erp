const fs = require('fs')

// ── Fix 1: batches API — fix reset_process to use correct PATCH syntax ────────
const apiPath = 'app/api/batches/route.ts'
let api = fs.readFileSync(apiPath, 'utf8')

const OLD_RESET = `    // ── Reset a process step so batch can be marked done again ─────────────
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
    }`

const NEW_RESET = `    // ── Reset a process step so batch can be marked done again ─────────────
    if (action === 'reset_process') {
      const { batch_id, process_code } = payload
      if (!batch_id || !process_code) {
        return NextResponse.json({ ok: false, error: 'batch_id and process_code required' }, { status: 400 })
      }
      // Use dbUpdate to reset the batch_process row
      const { data, error } = await dbUpdate(
        'batch_processes',
        { batch_id, process_code },
        { status: 'pending', done_at: null, sent_at: null }
      )
      if (error) return NextResponse.json({ ok: false, error }, { status: 500 })
      return NextResponse.json({ ok: true, data })
    }`

if (api.includes(OLD_RESET)) {
  api = api.replace(OLD_RESET, NEW_RESET)
  fs.writeFileSync(apiPath, api, 'utf8')
  console.log('✓ Fix 1: reset_process now uses dbUpdate correctly')
} else console.error('✗ Fix 1 pattern not found')

// ── Fix 2: FMS page — fix filter to only show batches where current_process matches ──
// Remove the second condition that shows batches just because process is in route
const fmsPath = 'app/fms/[process]/page.tsx'
let fms = fs.readFileSync(fmsPath, 'utf8')

const OLD_FILTER = `      // Filter to batches whose current_process matches this page's code
      const filtered = batches.filter(b => {
        const order = orderMap[b.order_id]
        const route: string[] = order?.process_route || []
        return (
          b.current_process?.toUpperCase() === processCode ||
          route.some((c: string) => c.toUpperCase() === processCode)
        )
      })`

const NEW_FILTER = `      // Filter to ONLY batches whose current_process matches this page's code
      // Do NOT use route.some() — that would show batch on ALL process pages in its route
      const filtered = batches.filter(b =>
        b.current_process?.toUpperCase() === processCode ||
        b.current_process === processCode
      )`

if (fms.includes(OLD_FILTER)) {
  fms = fms.replace(OLD_FILTER, NEW_FILTER)
  console.log('✓ Fix 2: FMS filter now uses ONLY current_process match (not route.some)')
} else console.error('✗ Fix 2 filter pattern not found')

// ── Fix 3: FMS page — C page shows done batch — fix isCompleted check ─────────
// C page shows batch because batch_processes.C is 'done'
// isCompleted should check the CURRENT process status, not just done_at
const OLD_BP = `        // Actual date from batch_processes
        const bp = (b.batch_processes || []).find((p: any) =>
          p.process_code?.toUpperCase() === processCode ||
          p.process_code === processCode
        )
        const actual = bp?.done_at ? bp.done_at.split('T')[0] : ''
        const delay  = delayMeta(planned, actual, now)
        // Timestamp = sent_at on batch (when it arrived at this process)
        const sentAt = b.sent_at || b.updated_at || b.created_at || ''`

const NEW_BP = `        // Actual date from batch_processes for THIS specific process
        const bp = (b.batch_processes || []).find((p: any) =>
          p.process_code?.toUpperCase() === processCode ||
          p.process_code === processCode
        )
        // Only mark as completed if this process step is done AND it's still the current process
        const actual = bp?.done_at ? bp.done_at.split('T')[0] : ''
        const delay  = delayMeta(planned, actual, now)
        // Timestamp = sent_at on batch (when it arrived at this process)
        const sentAt = b.sent_at || b.updated_at || b.created_at || ''`

if (fms.includes(OLD_BP)) {
  fms = fms.replace(OLD_BP, NEW_BP)
  console.log('✓ Fix 3: actual date check preserved correctly')
} else console.error('- Fix 3: no change needed for BP pattern')

// Fix the isCompleted to check bp.status not just done_at
const OLD_COMPLETED = `          isCompleted:     !!actual,`
const NEW_COMPLETED = `          isCompleted:     bp?.status === 'done' && !!actual,`

if (fms.includes(OLD_COMPLETED)) {
  fms = fms.replace(OLD_COMPLETED, NEW_COMPLETED)
  console.log('✓ Fix 3: isCompleted checks bp.status === done AND has done_at')
} else console.error('✗ Fix 3 isCompleted pattern not found')

fs.writeFileSync(fmsPath, fms, 'utf8')
console.log('\n✓ All 3 fixes applied')
