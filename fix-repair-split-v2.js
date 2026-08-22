const fs = require('fs')
let c = fs.readFileSync('app/repairing-order/page.tsx', 'utf8')

// Fix 1: Full Split — set status to pending
const OLD_FULL = `  const doFullSplit = async (r: any) => {
    if (!confirm(\`Full Split: \${r.batch_id_str} stays as single batch ready for process?\`)) return
    setSaving(true)
    try {
      // Just confirm the batch is set to pending with its route
      const res = await fetch('/api/batches', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({
          action: 'update', id: r.batch_id,
          status: 'pending',
        })
      }).then(x=>x.json())
      if (!res.ok) { alert('Error: ' + res.error); return }
      showToast(\`✓ \${r.batch_id_str} ready as single batch\`)
      load()
    } finally { setSaving(false) }
  }`

const NEW_FULL = `  const doFullSplit = async (r: any) => {
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

if (c.includes(OLD_FULL)) {
  c = c.replace(OLD_FULL, NEW_FULL)
  console.log('✓ Full Split updated')
} else console.error('✗ Full Split pattern not found')

// Fix 2: Split first part — set to pending
const OLD_FIRST = `      // First part: update original batch kg
      await fetch('/api/batches', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({
          action:'update', id: batchUUID,
          kg: parseFloat(splitParts[0].kg)||0,
          mtr: parseFloat(splitParts[0].mtr)||0,
          taka: parseInt(splitParts[0].taka)||0,
          machine_id: splitParts[0].machine_id || splitModal.machine_id || null,
        })
      })`

const NEW_FIRST = `      // First part: update original batch — set to pending so it shows on Splitted Orders
      await fetch('/api/batches', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({
          action:'update', id: batchUUID,
          kg:         parseFloat(splitParts[0].kg)||0,
          mtr:        parseFloat(splitParts[0].mtr)||0,
          taka:       parseInt(splitParts[0].taka)||0,
          machine_id: splitParts[0].machine_id || splitModal.machine_id || null,
          status:     'pending',
        })
      })`

if (c.includes(OLD_FIRST)) {
  c = c.replace(OLD_FIRST, NEW_FIRST)
  console.log('✓ Split first part sets pending')
} else console.error('✗ Split first part not found')

// Fix 3: New split batches — set to pending not repairing
const OLD_STATUS = `            status:        'repairing',`
const NEW_STATUS = `            status:        'pending',`

if (c.includes(OLD_STATUS)) {
  c = c.replace(OLD_STATUS, NEW_STATUS)
  console.log('✓ New split batches set to pending')
} else console.error('✗ New batch status not found')

// Fix 4: Update repairing order after split + better toast
const OLD_TOAST = `      showToast(\`✓ Split into \${splitParts.length} batches: \${baseId} + \${splitParts.slice(1).map((_,i)=>getSplitId(baseId,i+1)).join(', ')}\`)`

const NEW_TOAST = `      if (splitModal.id) {
        await fetch('/api/repairing-orders', {
          method:'POST', headers:{'Content-Type':'application/json'},
          body: JSON.stringify({ action:'update', id:splitModal.id, status:'In Repair' })
        })
      }
      showToast('✓ Split into ' + splitParts.length + ' batches — now on Splitted Orders page')`

if (c.includes(OLD_TOAST)) {
  c = c.replace(OLD_TOAST, NEW_TOAST)
  console.log('✓ Toast and repairing order update added')
} else console.error('✗ Toast pattern not found')

fs.writeFileSync('app/repairing-order/page.tsx', c, 'utf8')
console.log('\n✓ Done')
