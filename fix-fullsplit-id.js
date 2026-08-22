const fs = require('fs')
let c = fs.readFileSync('app/repairing-order/page.tsx', 'utf8')

// The issue: doFullSplit calls batches API with action:'update', id: r.batch_id
// But r.batch_id from the enriched API is repairing_orders.batch_id (UUID of batch)
// which was null. Now it's fixed in DB but let's also add better error handling
// and use r.batch_id (the batch UUID from repairing_orders table)

// Also the split uses r.batch_id for the batch UUID - same field
// Let's check what fields the enriched record has:
// r.id = repairing_order UUID
// r.batch_id = batch UUID (from repairing_orders.batch_id column)  
// r.batch_id_str = human readable batch ID (e.g. DYE26-0001-B1-R)

// The doFullSplit currently does: action:'update', id: r.batch_id
// This is CORRECT - r.batch_id IS the batch UUID
// Problem was r.batch_id was null in DB - now fixed

// Let's just verify the code is passing the right thing and add null check
const OLD_FULL = `  const doFullSplit = async (r: any) => {
    if (!confirm('Full Split: ' + r.batch_id_str + ' will appear on Splitted Orders as a single batch.')) return
    setSaving(true)
    try {
      const res = await fetch('/api/batches', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ action:'update', id:r.batch_id, status:'pending' })
      }).then(x=>x.json())
      if (!res.ok) { alert('Error: ' + res.error); return }
      if (r.id) {
        await fetch('/api/repairing-orders', {
          method:'POST', headers:{'Content-Type':'application/json'},
          body: JSON.stringify({ action:'update', id:r.id, status:'In Repair' })
        })
      }
      showToast('✓ ' + r.batch_id_str + ' now on Splitted Orders page')
      load()
    } finally { setSaving(false) }
  }`

const NEW_FULL = `  const doFullSplit = async (r: any) => {
    // r.batch_id = UUID of the batch in batches table
    // r.id = UUID of the repairing order
    if (!r.batch_id) { alert('Error: Batch not linked. Refresh and try again.'); return }
    if (!confirm('Full Split: ' + r.batch_id_str + ' (' + r.repair_kg + ' Kg) will appear on Splitted Orders as a single batch.')) return
    setSaving(true)
    try {
      // Update batch status from repairing → pending so it shows on Splitted Orders
      const res = await fetch('/api/batches', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ action:'update', id:r.batch_id, status:'pending' })
      }).then(x=>x.json())
      if (!res.ok) { alert('Error updating batch: ' + res.error); return }
      // Update repairing order status to In Repair
      await fetch('/api/repairing-orders', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ action:'update', id:r.id, status:'In Repair' })
      })
      showToast('✓ ' + r.batch_id_str + ' now on Splitted Orders page')
      load()
    } finally { setSaving(false) }
  }`

if (c.includes(OLD_FULL)) {
  c = c.replace(OLD_FULL, NEW_FULL)
  console.log('✓ doFullSplit updated with null check and clear logic')
} else console.error('✗ doFullSplit pattern not found')

// Also fix saveSplits to use r.batch_id correctly
const OLD_SPLIT_UUID = `      const baseId    = splitModal.batch_id_str  // e.g. DYE26-0001-B1-R
      const batchUUID = splitModal.batch_id      // UUID of the batch`

const NEW_SPLIT_UUID = `      const baseId    = splitModal.batch_id_str  // e.g. DYE26-0001-B1-R
      const batchUUID = splitModal.batch_id      // UUID of the batch (from repairing_orders.batch_id)
      if (!batchUUID) { alert('Error: Batch not linked. Refresh and try again.'); setSaving(false); return }`

if (c.includes(OLD_SPLIT_UUID)) {
  c = c.replace(OLD_SPLIT_UUID, NEW_SPLIT_UUID)
  console.log('✓ saveSplits null check added')
} else console.error('✗ saveSplits UUID pattern not found')

fs.writeFileSync('app/repairing-order/page.tsx', c, 'utf8')
console.log('✓ Done')
