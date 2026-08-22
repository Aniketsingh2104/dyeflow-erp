const fs = require('fs')

// Fix 1: Add Delete button to Repairing Order page
let page = fs.readFileSync('app/repairing-order/page.tsx', 'utf8')

// Add handleDelete function before handleUpdate
const OLD_UPDATE = `  const handleUpdate = async () => {`

const NEW_UPDATE = `  const handleDelete = async (r: any) => {
    const msg = r.reprocess_type === 'partial'
      ? \`Roll back \${r.repair_kg}Kg to \${r.source_type === 'fob' ? 'FOB' : 'Faulty'} page?\\nBatch ID will revert: \${r.batch_id_str} → \${revertId(r.batch_id_str)}\`
      : \`Roll back batch \${r.batch_id_str} to \${r.source_type === 'fob' ? 'FOB' : 'Faulty'} page?\\nBatch ID will revert: \${r.batch_id_str} → \${revertId(r.batch_id_str)}\`
    if (!confirm(msg)) return
    setSaving(true)
    try {
      const res = await fetch('/api/repairing-orders', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'delete', id: r.id })
      }).then(x => x.json())
      if (!res.ok) { alert('Error: ' + res.error); return }
      const dest = res.source_type === 'fob' ? 'FOB' : 'Faulty'
      showToast(\`↩ Batch \${res.reverted_batch_id} returned to \${dest} page\`)
      load()
    } finally { setSaving(false) }
  }

  // Helper to show what batch ID will revert to
  const revertId = (batchId: string) => {
    if (!batchId) return batchId
    if (batchId.match(/-R{2,}$/)) return batchId.slice(0, -1)
    if (batchId.endsWith('-R')) return batchId.slice(0, -2)
    return batchId
  }

  const handleUpdate = async () => {`

if (page.includes(OLD_UPDATE)) {
  page = page.replace(OLD_UPDATE, NEW_UPDATE)
  console.log('✓ Added handleDelete to Repairing Order page')
} else console.error('✗ handleUpdate pattern not found')

// Update actions column to show Delete button
const OLD_ACTIONS = `                        case 'actions': return (
                          <td key={col.key} style={{...s, overflow:'visible'}}>
                            <button className="xs"
                              onClick={() => { setEditModal(r); setEditData({ status:r.status, notes:r.notes||'', repair_kg:r.repair_kg }) }}>
                              Edit
                            </button>
                          </td>
                        )`

const NEW_ACTIONS = `                        case 'actions': return (
                          <td key={col.key} style={{...s, overflow:'visible'}}>
                            <div style={{ display:'flex', gap:4 }}>
                              <button className="xs"
                                onClick={() => { setEditModal(r); setEditData({ status:r.status, notes:r.notes||'', repair_kg:r.repair_kg }) }}>
                                Edit
                              </button>
                              <button className="xs"
                                onClick={() => handleDelete(r)}
                                disabled={saving}
                                style={{ padding:'3px 8px', fontSize:11, fontWeight:700,
                                  border:'1px solid #DC2626', borderRadius:4,
                                  cursor:'pointer', background:'transparent', color:'#DC2626' }}
                                title={\`Roll back to \${r.source_type === 'fob' ? 'FOB' : 'Faulty'} page\`}>
                                ↩ Delete
                              </button>
                            </div>
                          </td>
                        )`

if (page.includes(OLD_ACTIONS)) {
  page = page.replace(OLD_ACTIONS, NEW_ACTIONS)
  console.log('✓ Added Delete button to actions column')
} else console.error('✗ Actions pattern not found')

fs.writeFileSync('app/repairing-order/page.tsx', page, 'utf8')

// Fix 2: Faulty API — pass faulty_id when creating repairing order
let faulty = fs.readFileSync('app/api/faulty/route.ts', 'utf8')

const OLD_FAULTY_INSERT = `    // Create repairing order with new batch ID
    await dbInsert('repairing_orders', {
      batch_id, order_id: order_id||null,
      repair_kg: repairKg,
      repair_mtr:  isPartial ? (parseFloat(reprocess_mtr)||null) : null,
      repair_taka: isPartial ? (parseFloat(reprocess_taka)||null) : null,
      process_route: route, status:'pending',
      notes: reprocess_reason, source_type:'faulty', reprocess_type,
    })`

const NEW_FAULTY_INSERT = `    // Create repairing order with new batch ID + faulty_id link for rollback
    await dbInsert('repairing_orders', {
      batch_id,
      faulty_id:   id,            // link to faulty_record for rollback
      order_id:    order_id||null,
      repair_kg:   repairKg,
      repair_mtr:  isPartial ? (parseFloat(reprocess_mtr)||null) : null,
      repair_taka: isPartial ? (parseFloat(reprocess_taka)||null) : null,
      process_route: route, status:'pending',
      notes: reprocess_reason, source_type:'faulty', reprocess_type,
    })`

if (faulty.includes(OLD_FAULTY_INSERT)) {
  faulty = faulty.replace(OLD_FAULTY_INSERT, NEW_FAULTY_INSERT)
  fs.writeFileSync('app/api/faulty/route.ts', faulty, 'utf8')
  console.log('✓ Faulty API: passes faulty_id to repairing order for rollback link')
} else console.error('✗ Faulty insert pattern not found')

// Fix 3: FOB API — pass fob_id when creating repairing order
let fob = fs.readFileSync('app/api/fob/route.ts', 'utf8')

const OLD_FOB_INSERT = `    await dbInsert('repairing_orders', {
      batch_id, order_id: order_id||null,
      repair_kg: repairKg,
      repair_mtr:  isPartial ? (parseFloat(reprocess_mtr)||null) : null,
      repair_taka: isPartial ? (parseFloat(reprocess_taka)||null) : null,
      process_route: route, status:'pending',
      notes: reprocess_reason, source_type:'fob', reprocess_type,
    })`

const NEW_FOB_INSERT = `    await dbInsert('repairing_orders', {
      batch_id,
      fob_id:      id,            // link to fob_record for rollback
      order_id:    order_id||null,
      repair_kg:   repairKg,
      repair_mtr:  isPartial ? (parseFloat(reprocess_mtr)||null) : null,
      repair_taka: isPartial ? (parseFloat(reprocess_taka)||null) : null,
      process_route: route, status:'pending',
      notes: reprocess_reason, source_type:'fob', reprocess_type,
    })`

if (fob.includes(OLD_FOB_INSERT)) {
  fob = fob.replace(OLD_FOB_INSERT, NEW_FOB_INSERT)
  fs.writeFileSync('app/api/fob/route.ts', fob, 'utf8')
  console.log('✓ FOB API: passes fob_id to repairing order for rollback link')
} else console.error('✗ FOB insert pattern not found')

console.log('\n✓ All done')
