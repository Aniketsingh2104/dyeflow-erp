const fs = require('fs')
let c = fs.readFileSync('app/api/fob/route.ts', 'utf8')

// Replace the batch_processes PATCH with upsert (INSERT or UPDATE)
// Repair batches don't have batch_processes rows — PATCH silently does nothing
const OLD = `    // Update batch_processes: mark this process as 'fob' so FMS page keeps showing batch
    // with FOB badge; batch stays visible on this process page
    const now = new Date().toISOString()
    await sb('/batch_processes', {
      method: 'PATCH',
      body: JSON.stringify({ status: 'fob', done_at: now }),
      params: {
        batch_id:     \`eq.\${payload.batch_id}\`,
        process_code: \`eq.\${payload.process_code}\`,
      },
      headers: { 'Prefer': 'return=minimal' },
    })`

const NEW = `    // Upsert batch_processes: mark this process as 'fob' with done_at timestamp
    // Use upsert because repair batches may not have batch_processes rows yet
    const now = new Date().toISOString()
    await sb('/batch_processes', {
      method: 'POST',
      body: JSON.stringify({
        batch_id:     payload.batch_id,
        process_code: payload.process_code,
        status:       'fob',
        done_at:      now,
      }),
      headers: {
        'Prefer': 'resolution=merge-duplicates,return=minimal',
      },
    })`

if (c.includes(OLD)) {
  c = c.replace(OLD, NEW)
  fs.writeFileSync('app/api/fob/route.ts', c, 'utf8')
  console.log('✓ FOB create: uses upsert for batch_processes (works for repair batches too)')
} else console.error('✗ Pattern not found')
