const fs = require('fs')

// Fix 1: Splitted Orders page — exclude 'repairing' batches
let splitted = fs.readFileSync('app/splitted-orders/page.tsx', 'utf8')

const OLD_LOAD = `      setRows(batches.map(b => {`

const NEW_LOAD = `      // Exclude 'repairing' batches — they only appear after Split/Full Split is done
      const splitBatches = batches.filter((b: any) => b.status !== 'repairing')

      setRows(splitBatches.map(b => {`

if (splitted.includes(OLD_LOAD)) {
  splitted = splitted.replace(OLD_LOAD, NEW_LOAD)
  fs.writeFileSync('app/splitted-orders/page.tsx', splitted, 'utf8')
  console.log('✓ Splitted Orders excludes repairing batches')
} else console.error('✗ Load pattern not found')

// Fix 2: Repairing Order page — Full Split sets status to 'pending'
let repair = fs.readFileSync('app/repairing-order/page.tsx', 'utf8')

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
    if (!confirm(\`Full Split: \${r.batch_id_str} (${r?.repair_kg || r?.kg} Kg) will appear on Splitted Orders as a single batch.\`)) return
    setSaving(true)
    try {
      // Set status to 'pending' → batch now appears on Splitted Orders page
      const res = await fetch('/api/batches', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({
          action: 'update', id: r.batch_id,
          status: 'pending',
        })
      }).then(x=>x.json())
      if (!res.ok) { alert('Error: ' + res.error); return }
      // Update repairing order status to 'In Repair'
      if (r.id) {
        await fetch('/api/repairing-orders', {
          method:'POST', headers:{'Content-Type':'application/json'},
          body: JSON.stringify({ action:'update', id:r.id, status:'In Repair' })
        })
      }
      showToast(\`✓ \${r.batch_id_str} now on Splitted Orders page\`)
      load()
    } finally { setSaving(false) }
  }`

if (repair.includes(OLD_FULL)) {
  repair = repair.replace(OLD_FULL, NEW_FULL)
  console.log('✓ Full Split sets status to pending → appears on Splitted Orders')
} else console.error('✗ Full Split pattern not found')

// Fix 3: Split saveSplits — set both original and new batches to 'pending'
const OLD_SPLIT_FIRST = `      // First part: update original batch kg
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

const NEW_SPLIT_FIRST = `      // First part: update original batch kg + set to pending → appears on Splitted Orders
      await fetch('/api/batches', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({
          action:'update', id: batchUUID,
          kg:         parseFloat(splitParts[0].kg)||0,
          mtr:        parseFloat(splitParts[0].mtr)||0,
          taka:       parseInt(splitParts[0].taka)||0,
          machine_id: splitParts[0].machine_id || splitModal.machine_id || null,
          status:     'pending',  // now shows on Splitted Orders
        })
      })`

if (repair.includes(OLD_SPLIT_FIRST)) {
  repair = repair.replace(OLD_SPLIT_FIRST, NEW_SPLIT_FIRST)
  console.log('✓ Split first part sets status to pending')
} else console.error('✗ Split first part pattern not found')

// Fix 4: New split batches also set to 'pending' not 'repairing'
const OLD_NEW_BATCH = `            status:        'repairing',`
const NEW_NEW_BATCH = `            status:        'pending',   // appears on Splitted Orders`

if (repair.includes(OLD_NEW_BATCH)) {
  repair = repair.replace(OLD_NEW_BATCH, NEW_NEW_BATCH)
  console.log('✓ New split batches also set to pending')
} else console.error('✗ New batch status pattern not found')

// Fix 5: Update repairing order status after split
const OLD_SPLIT_TOAST = `      showToast(\`✓ Split into \${splitParts.length} batches: \${baseId} + \${splitParts.slice(1).map((_,i)=>getSplitId(baseId,i+1)).join(', ')}\`)`

const NEW_SPLIT_TOAST = `      // Update repairing order status to 'In Repair'
      if (splitModal.id) {
        await fetch('/api/repairing-orders', {
          method:'POST', headers:{'Content-Type':'application/json'},
          body: JSON.stringify({ action:'update', id:splitModal.id, status:'In Repair' })
        })
      }
      showToast(\`✓ Split into \${splitParts.length} batches — now on Splitted Orders page\`)`

if (repair.includes(OLD_SPLIT_TOAST)) {
  repair = repair.replace(OLD_SPLIT_TOAST, NEW_SPLIT_TOAST)
  console.log('✓ Repairing order updated to In Repair after split')
} else console.error('✗ Split toast pattern not found')

fs.writeFileSync('app/repairing-order/page.tsx', repair, 'utf8')
console.log('\n✓ All fixes applied')
