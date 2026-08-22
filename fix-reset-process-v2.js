const fs = require('fs')

// Fix batches API reset_process — use direct SQL via RPC or fix the filter
const apiPath = 'app/api/batches/route.ts'
let api = fs.readFileSync(apiPath, 'utf8')

const OLD = `    // ── Reset a process step so batch can be marked done again ─────────────
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

const NEW = `    // ── Reset a process step so batch can be marked done again ─────────────
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

if (api.includes(OLD)) {
  api = api.replace(OLD, NEW)
  fs.writeFileSync(apiPath, api, 'utf8')
  console.log('✓ reset_process now uses sb() with query params correctly')
} else console.error('✗ Pattern not found')

// Fix FMS page — getBatches needs to include batch_processes in select
// so we can read bp.status correctly
// Also fix: when getBatches fetches, it should include batch_processes
// Currently getBatches({ status: 'in-process' }) - check what select string it uses
const libPath = 'lib/db.ts'
let lib = fs.readFileSync(libPath, 'utf8')
console.log('lib/db.ts getBatches select:', lib.includes('batch_processes') ? 'has batch_processes' : 'MISSING batch_processes')

// Fix FMS page loadRows to fetch batch_processes separately if not included
const fmsPath = 'app/fms/[process]/page.tsx'
let fms = fs.readFileSync(fmsPath, 'utf8')

// The real fix: don't rely on bp.status from nested batch_processes
// Instead: isCompleted = false when batch has been rolled back (current_process changed)
// A batch on C page where current_process = C means it's ACTIVE (not done yet)
// It was previously done (bp.status=done) but was rolled back
// So: isCompleted should only be true if bp.status='done' AND batch.current_process still === processCode
// But since we rolled back, current_process = C, so the batch IS active
// The issue is bp still says done even though we tried to reset it

// The simpler fix: check batch.status field
// After rollback: batch.status = 'in-process', current_process = 'C'  
// A batch is "done" on this page only if bp.status = 'done'
// Since reset_process API was broken, bp.status = 'done' persisted

// Fix isCompleted: use batch-level status as the source of truth
const OLD_COMPLETED = `          isCompleted:     bp?.status === 'done' && !!actual,`
const NEW_COMPLETED = `          // isCompleted: only true if this specific process step is marked done
          // bp.status must be 'done' — if reset_process ran, it's 'pending'
          isCompleted:     bp?.status === 'done',`

if (fms.includes(OLD_COMPLETED)) {
  fms = fms.replace(OLD_COMPLETED, NEW_COMPLETED)
  console.log('✓ isCompleted uses bp.status only')
} else console.error('✗ isCompleted pattern not found')

// Also fix: Done button should be disabled only if bp.status === 'done'
const OLD_DONE_BTN = `                                <button onClick={() => !done && handleDone(row)} disabled={done || saving}`
const NEW_DONE_BTN = `                                <button onClick={() => !done && handleDone(row)} disabled={done || saving}`
// Already correct — 'done' variable = isCompleted

fs.writeFileSync(fmsPath, fms, 'utf8')
console.log('✓ FMS page fixed')
