const fs = require('fs')

// Fix repair-assign API: assigning route should NOT change status to pending
// Status stays 'repairing' until Split/Full Split is clicked on Repairing Orders page
let api = fs.readFileSync('app/api/repair-assign/route.ts', 'utf8')

const OLD = `    const { error: bErr } = await dbUpdate("batches", { id: batch_id }, {
      supervisor_id:   supervisor_id || null,
      machine_id,
      process_route,
      status:          "pending",
      current_process: null,
    })`

const NEW = `    const { error: bErr } = await dbUpdate("batches", { id: batch_id }, {
      supervisor_id:   supervisor_id || null,
      machine_id,
      process_route,
      // Keep status as 'repairing' — only changes to 'pending' when Split/Full Split clicked
      status:          "repairing",
      current_process: null,
    })`

if (api.includes(OLD)) {
  api = api.replace(OLD, NEW)
  fs.writeFileSync('app/api/repair-assign/route.ts', api, 'utf8')
  console.log('✓ repair-assign: status stays repairing after route assignment')
} else console.error('✗ Pattern not found')
