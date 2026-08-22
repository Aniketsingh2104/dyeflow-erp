// Run from C:\dyeflow-react: node fix-batches-api.js

const fs = require('fs')
const path = require('path')

const filePath = path.join(__dirname, 'app', 'api', 'batches', 'route.ts')
let content = fs.readFileSync(filePath, 'utf8')

// Add delete_batch action + mtr/taka to create_splits
const oldCreateSplits = `      const rows = batches.map((b: any, idx: number) => ({
        batch_id:     b.batch_id,
        order_id,
        machine_id:   b.machine_id || null,
        batch_number: idx + 1,
        kg:           b.kg,
        status:       'pending',
      }))`

const newCreateSplits = `      const rows = batches.map((b: any, idx: number) => ({
        batch_id:     b.batch_id,
        order_id,
        machine_id:   b.machine_id || null,
        batch_number: idx + 1,
        kg:           b.kg,
        mtr:          b.mtr  || null,
        taka:         b.taka || null,
        status:       'pending',
      }))`

if (content.includes(oldCreateSplits)) {
  content = content.replace(oldCreateSplits, newCreateSplits)
  console.log('✓ create_splits now saves mtr and taka')
} else {
  console.error('✗ create_splits pattern not found')
}

// Add delete_batch action before the final "Unknown action" return
const oldUnknown = `    return NextResponse.json({ ok: false, error: 'Unknown action' }, { status: 400 })`

const newUnknown = `    // ── Delete one batch and restore qty to order ────────────────────────────
    if (action === 'delete_batch') {
      const { id, order_id } = payload
      if (!id) return NextResponse.json({ ok: false, error: 'id required' }, { status: 400 })

      // Get the batch to know its kg before deleting
      const { data: batchRows } = await dbSelect('batches', { id: \`eq.\${id}\`, limit: '1' }, 'id,kg,mtr,taka,status,is_done,batch_id,order_id')
      const batch = batchRows?.[0]
      if (!batch) return NextResponse.json({ ok: false, error: 'Batch not found' }, { status: 404 })

      // Safety check — cannot delete if in-process or done
      if (batch.is_done || batch.status === 'done' || batch.status === 'in-process') {
        return NextResponse.json({ ok: false, error: 'Cannot delete a batch that is in-process or done' }, { status: 400 })
      }

      // Delete batch_processes first, then the batch
      await sb('/batch_processes', {
        method: 'DELETE',
        params: { batch_id: \`eq.\${batch.id}\` },
        headers: { 'Prefer': 'return=minimal' },
      })
      const { error: delError } = await dbDelete('batches', { id })
      if (delError) return NextResponse.json({ ok: false, error: delError }, { status: 500 })

      // Check if this order has any remaining batches
      const { data: remaining } = await dbSelect('batches', { order_id: \`eq.\${batch.order_id}\`, limit: '1' }, 'id')
      if (!remaining?.length) {
        // No batches left — revert order status back to splitting so supervisor can re-split
        await dbUpdate('orders', { id: batch.order_id }, { status: 'splitting' })
      }

      await auditLog({ username: _user, action: 'delete_batch', entity_type: 'batch',
        entity_id: batch.batch_id, note: \`Deleted \${batch.kg} Kg\` })

      return NextResponse.json({ ok: true, restored_kg: batch.kg })
    }

    return NextResponse.json({ ok: false, error: 'Unknown action' }, { status: 400 })`

if (content.includes(oldUnknown)) {
  content = content.replace(oldUnknown, newUnknown)
  console.log('✓ Added delete_batch action to batches API')
} else {
  console.error('✗ Unknown action pattern not found')
}

fs.writeFileSync(filePath, content, 'utf8')
console.log('\n✓ batches API updated.')
