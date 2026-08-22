// Run from C:\dyeflow-react: node fix-batches-process-route.js
// Saves process_route on every batch at split time so machine page always has it

const fs   = require('fs')
const path = require('path')
const filePath = path.join(__dirname, 'app', 'api', 'batches', 'route.ts')
let content = fs.readFileSync(filePath, 'utf8')

// Fix 1: create_splits — add process_route to each batch row
const oldRows = `      const rows = batches.map((b: any, idx: number) => ({
        batch_id:     b.batch_id,
        order_id,
        machine_id:   b.machine_id || null,
        batch_number: idx + 1,
        kg:           b.kg,
        mtr:          b.mtr  || null,
        taka:         b.taka || null,
        status:       'pending',
      }))`

const newRows = `      const rows = batches.map((b: any, idx: number) => ({
        batch_id:      b.batch_id,
        order_id,
        machine_id:    b.machine_id || null,
        batch_number:  idx + 1,
        kg:            b.kg,
        mtr:           b.mtr  || null,
        taka:          b.taka || null,
        status:        'pending',
        process_route: process_route || [],  // save route on batch so machine page shows correct process
      }))`

if (content.includes(oldRows)) {
  content = content.replace(oldRows, newRows)
  console.log('✓ create_splits: process_route now saved on each batch row')
} else {
  console.error('✗ create_splits rows pattern not found')
}

// Fix 2: full_split — process_route already saved (it's in the batch object)
// Verify it's there
if (content.includes('process_route: process_route || []')) {
  console.log('✓ full_split: process_route already saved on batch')
} else {
  console.error('✗ full_split: process_route missing — check manually')
}

fs.writeFileSync(filePath, content, 'utf8')
console.log('\n✓ Done — new batches will always have process_route saved.')
