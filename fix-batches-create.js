const fs = require('fs')

// Check if batches API has a 'create' action for single batch creation
const apiPath = 'app/api/batches/route.ts'
let api = fs.readFileSync(apiPath, 'utf8')

const hasCreate = api.includes("action === 'create'")
console.log('Has create action:', hasCreate)

if (!hasCreate) {
  // Add create action before unknown action handler
  const OLD = `    return NextResponse.json({ ok: false, error: 'Unknown action' }, { status: 400 })`
  const NEW = `    // ── Create single batch (for repair splits) ──────────────────────────────
    if (action === 'create') {
      const { batch_id, order_id, kg, mtr, taka, machine_id, process_route, status } = payload
      if (!order_id) return NextResponse.json({ ok: false, error: 'order_id required' }, { status: 400 })
      const { data, error } = await dbInsert('batches', {
        batch_id:      batch_id   || null,
        order_id:      order_id,
        kg:            kg         || 0,
        mtr:           mtr        || 0,
        taka:          taka       || 0,
        machine_id:    machine_id || null,
        process_route: process_route || [],
        status:        status     || 'pending',
        is_faulty:     false,
        is_done:       false,
      })
      if (error) return NextResponse.json({ ok: false, error }, { status: 500 })
      return NextResponse.json({ ok: true, data })
    }

    return NextResponse.json({ ok: false, error: 'Unknown action' }, { status: 400 })`

  if (api.includes(OLD)) {
    api = api.replace(OLD, NEW)
    fs.writeFileSync(apiPath, api, 'utf8')
    console.log('✓ Added create action to batches API')
  } else {
    console.error('✗ Unknown action pattern not found')
  }
} else {
  console.log('- create action already exists')
}
