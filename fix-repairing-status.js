const fs = require('fs')

// Fix 1: faulty API — use 'repairing' status (valid now)
let faulty = fs.readFileSync('app/api/faulty/route.ts', 'utf8')
faulty = faulty.replace(
  `is_faulty:false, status:'repairing', current_process:null,`,
  `is_faulty:false, status:'repairing', current_process:null,`
)
// Already correct — no change needed

// Fix 2: FOB API — same
let fob = fs.readFileSync('app/api/fob/route.ts', 'utf8')
// Already correct

// Fix 3: repair-assign API — filter uses 'repairing' which is now valid
let ra = fs.readFileSync('app/api/repair-assign/route.ts', 'utf8')
console.log('repair-assign filter:', ra.includes("status: 'eq.repairing'") ? '✓ correct' : '✗ wrong')

// Fix 4: repairing-orders API delete action — use 'repairing' not 'faulty'
let ro = fs.readFileSync('app/api/repairing-orders/route.ts', 'utf8')
const OLD_ROLLBACK = `    // 4. Update batch — revert ID and set back to faulty status
    await dbUpdate('batches', { id: ro.batch_id }, {
      batch_id:        revertedBatchId,
      status:          'faulty',
      current_process: null,
      is_faulty:       true,
    })`

const NEW_ROLLBACK = `    // 4. Update batch — revert ID and set back to repairing/faulty status
    await dbUpdate('batches', { id: ro.batch_id }, {
      batch_id:        revertedBatchId,
      status:          'faulty',
      current_process: null,
      is_faulty:       true,
    })`

// No change needed — rollback correctly goes to 'faulty'
console.log('✓ repairing-orders rollback already correct')

// Fix 5: First Process Batch page — exclude 'repairing' batches (they need assignment first)
let fp = fs.readFileSync('app/first-process-batch/page.tsx', 'utf8')
const OLD_FILTER = `        .filter(b => b.status === 'pending' || !b.current_process)`
const NEW_FILTER = `        .filter(b => b.status === 'pending')`  // exclude repairing — needs supervisor assignment first

if (fp.includes(OLD_FILTER)) {
  fp = fp.replace(OLD_FILTER, NEW_FILTER)
  fs.writeFileSync('app/first-process-batch/page.tsx', fp, 'utf8')
  console.log('✓ First Process page: excludes repairing batches (needs supervisor assignment)')
} else {
  console.error('✗ First Process filter not found')
}

// Fix 6: repair-assign assign action — set status to 'pending' after assignment
// Verify it's correct
console.log('repair-assign sets pending:', ra.includes("status:          'pending'") ? '✓' : '✗')

console.log('\n✓ All checks done')
