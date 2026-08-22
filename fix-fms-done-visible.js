const fs = require('fs')

// ── Fix 1: FMS page — after Done, keep batch on page (don't filter out) ──────
// The issue: getBatches({ status: 'in-process' }) fetches only in-process batches
// After done, batch.status changes to something else → disappears
// Fix: fetch ALL batches for this process (both in-process and recently done)
// and keep done ones visible

const fmsPath = 'app/fms/[process]/page.tsx'
let fms = fs.readFileSync(fmsPath, 'utf8')

// Change getBatches to fetch both in-process and done batches
const OLD_FETCH = `        getBatches({ status: 'in-process' }),`
const NEW_FETCH = `        getBatches({ limit: 5000 }),  // fetch all batches, filter by current_process below`

if (fms.includes(OLD_FETCH)) {
  fms = fms.replace(OLD_FETCH, NEW_FETCH)
  console.log('✓ getBatches now fetches all batches not just in-process')
} else console.error('✗ getBatches pattern not found')

// Fix filter: show batches where current_process === processCode 
// OR where batch was recently done at this process (batch_processes.C = done)
// Simplest: show batch if current_process = processCode OR any bp.done_at exists for this process
const OLD_FILTER = `      // Filter to ONLY batches whose current_process matches this page's code
      // Do NOT use route.some() — that would show batch on ALL process pages in its route
      const filtered = batches.filter(b =>
        b.current_process?.toUpperCase() === processCode ||
        b.current_process === processCode
      )`

const NEW_FILTER = `      // Show batches that are currently AT this process (active)
      // OR have been processed here (batch_processes shows done for this code)
      const filtered = batches.filter(b => {
        // Active: currently at this process
        const isActive = b.current_process?.toUpperCase() === processCode ||
                         b.current_process === processCode
        // Done here: batch_processes has a done entry for this process code
        const isDoneHere = (b.batch_processes || []).some((bp: any) =>
          (bp.process_code?.toUpperCase() === processCode || bp.process_code === processCode) &&
          bp.status === 'done'
        )
        return isActive || isDoneHere
      })`

if (fms.includes(OLD_FILTER)) {
  fms = fms.replace(OLD_FILTER, NEW_FILTER)
  console.log('✓ Filter now shows both active and done-here batches')
} else console.error('✗ Filter pattern not found')

// Fix 2: handleRollback — after rollback, update local state immediately
// so the page reflects change without reload causing confusion
// Also fix: pass the correct batch UUID id to reset_process

const OLD_ROLLBACK_CALL = `      // 2. Reset current process's batch_process row: clear done_at, set status pending
      await fetch('/api/batches', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action:       'reset_process',
          batch_id:     row.id,
          process_code: row.current_process || processCode,
        })
      })`

const NEW_ROLLBACK_CALL = `      // 2. Reset current process's batch_process row using RPC
      // Use the process we're rolling BACK FROM (processCode = current page = C, H, D etc)
      await fetch('/api/batches', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action:       'reset_process',
          batch_id:     row.id,         // batch UUID
          process_code: processCode,    // the process we're rolling back from
        })
      })`

if (fms.includes(OLD_ROLLBACK_CALL)) {
  fms = fms.replace(OLD_ROLLBACK_CALL, NEW_ROLLBACK_CALL)
  console.log('✓ handleRollback uses processCode (current page) for reset')
} else console.error('✗ rollback call pattern not found')

fs.writeFileSync(fmsPath, fms, 'utf8')
console.log('\n✓ FMS page fixes done')
