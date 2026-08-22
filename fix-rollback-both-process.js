const fs = require('fs')
const filePath = 'app/fms/[process]/page.tsx'
let c = fs.readFileSync(filePath, 'utf8')

// THE ROOT CAUSE:
// When batch is on H page and you click Delete:
// - batch goes back to C (current_process = C)  
// - reset_process is called with processCode = 'H' (current page)
// - But we need to reset 'C' (where the batch is going) so Done works there
// 
// Actually NO - we need to reset 'C' because:
// C was previously marked done (that's why batch moved to H)
// Rolling back from H means C needs to be un-done so batch can be marked Done again on C page
//
// So: reset_process should use prevProcess (where batch is going back to), not processCode (current page)

const OLD_ROLLBACK = `    try {
      // 1. Update batch: set current_process to previous, clear sent_at
      await fetch('/api/batches', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action:          'update',
          id:              row.id,
          current_process: prevProcess,
          status:          newStatus,
          sent_at:         null,
        })
      })

      // 2. Reset current process's batch_process row using RPC
      // Use the process we're rolling BACK FROM (processCode = current page = C, H, D etc)
      await fetch('/api/batches', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action:       'reset_process',
          batch_id:     row.id,         // batch UUID
          process_code: processCode,    // the process we're rolling back from
        })
      })`

const NEW_ROLLBACK = `    try {
      // 1. Update batch: set current_process to previous, clear sent_at
      await fetch('/api/batches', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action:          'update',
          id:              row.id,
          current_process: prevProcess,
          status:          newStatus,
          sent_at:         null,
        })
      })

      // 2. Reset BOTH:
      //    a) The process we're rolling back FROM (current page) - mark as pending  
      //    b) The process we're going BACK TO (prevProcess) - so it can be marked Done again
      
      // Reset current process (where batch is now leaving)
      await fetch('/api/batches', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action:       'reset_process',
          batch_id:     row.id,
          process_code: processCode,   // current page (e.g. H - leaving this)
        })
      })

      // Reset previous process (where batch is going back to, so Done works)
      if (prevProcess) {
        await fetch('/api/batches', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action:       'reset_process',
            batch_id:     row.id,
            process_code: prevProcess,  // where batch goes back (e.g. C - needs to be active)
          })
        })
      }`

if (c.includes(OLD_ROLLBACK)) {
  c = c.replace(OLD_ROLLBACK, NEW_ROLLBACK)
  fs.writeFileSync(filePath, c, 'utf8')
  console.log('✓ handleRollback now resets BOTH current and previous process')
  console.log('  - Resets processCode (leaving H) → pending')
  console.log('  - Resets prevProcess (going to C) → pending so Done works again')
} else {
  console.error('✗ Pattern not found')
}

// Also fix DYE26-0004-B1 directly in Supabase via the fix script message
console.log('\nNote: Run this SQL to fix DYE26-0004-B1 C process in Supabase:')
console.log("UPDATE batch_processes SET status='pending', done_at=NULL")
console.log("FROM batches b WHERE batch_processes.batch_id=b.id")
console.log("AND b.batch_id='DYE26-0004-B1' AND batch_processes.process_code='C';")
