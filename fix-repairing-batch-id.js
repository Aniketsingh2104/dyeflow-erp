const fs = require('fs')

// Helper function to generate new repairing batch ID
// DYE26-0003-B2 → DYE26-0003-B2-R
// DYE26-0003-B2-R → DYE26-0003-B2-RR
// DYE26-0003-B2-RR → DYE26-0003-B2-RRR
const RENAME_HELPER = `
// Generate new batch ID for repairing
function getRepairingBatchId(currentBatchId: string): string {
  if (!currentBatchId) return currentBatchId
  // Check if already has -R suffix
  const match = currentBatchId.match(/^(.+?)(-R+)$/)
  if (match) {
    // Already has R's — add one more R
    return match[1] + match[2] + 'R'
  }
  // First time — add -R
  return currentBatchId + '-R'
}
`

// Fix faulty API
let faulty = fs.readFileSync('app/api/faulty/route.ts', 'utf8')

// Add helper after imports
faulty = faulty.replace(
  `import { NextRequest, NextResponse } from 'next/server'\nimport { dbSelect, dbUpdate, dbInsert, sb, auditLog } from '@/lib/supabase'`,
  `import { NextRequest, NextResponse } from 'next/server'\nimport { dbSelect, dbUpdate, dbInsert, sb, auditLog } from '@/lib/supabase'

// Generate new batch ID for repairing: B2 → B2-R → B2-RR → B2-RRR
function getRepairingBatchId(currentBatchId: string): string {
  if (!currentBatchId) return currentBatchId
  const match = currentBatchId.match(/^(.+?)(-R+)$/)
  if (match) return match[1] + match[2] + 'R'
  return currentBatchId + '-R'
}`
)
console.log('✓ Added getRepairingBatchId helper to faulty API')

// Add batch ID rename inside reprocess action — after fetching batch data and before creating repairing order
const OLD_FAULTY_REPROCESS = `    // Create repairing order
    await dbInsert('repairing_orders', {
      batch_id, order_id: order_id||null,
      repair_kg: repairKg,
      repair_mtr:  isPartial ? (parseFloat(reprocess_mtr)||null) : null,
      repair_taka: isPartial ? (parseFloat(reprocess_taka)||null) : null,
      process_route: route, status:'pending',
      notes: reprocess_reason, source_type:'faulty', reprocess_type,
    })

    // Update batch
    if (!isPartial || remainKg <= 0) {
      await dbUpdate('batches', { id: batch_id }, {
        is_faulty:false, status:'repairing', current_process:null,
      })`

const NEW_FAULTY_REPROCESS = `    // Get current batch ID and generate new repairing batch ID
    const { data: batchForId } = await dbSelect('batches', { id: \`eq.\${batch_id}\` }, 'id,batch_id,mtr,taka')
    const currentBatch = batchForId?.[0] || {}
    const newBatchId = getRepairingBatchId(currentBatch.batch_id || '')

    // Update batch_id to repairing ID (e.g. DYE26-0003-B2 → DYE26-0003-B2-R)
    if (newBatchId) {
      await dbUpdate('batches', { id: batch_id }, { batch_id: newBatchId })
    }

    // Create repairing order with new batch ID
    await dbInsert('repairing_orders', {
      batch_id, order_id: order_id||null,
      repair_kg: repairKg,
      repair_mtr:  isPartial ? (parseFloat(reprocess_mtr)||null) : null,
      repair_taka: isPartial ? (parseFloat(reprocess_taka)||null) : null,
      process_route: route, status:'pending',
      notes: reprocess_reason, source_type:'faulty', reprocess_type,
    })

    // Update batch
    if (!isPartial || remainKg <= 0) {
      await dbUpdate('batches', { id: batch_id }, {
        is_faulty:false, status:'repairing', current_process:null,
      })`

if (faulty.includes(OLD_FAULTY_REPROCESS)) {
  faulty = faulty.replace(OLD_FAULTY_REPROCESS, NEW_FAULTY_REPROCESS)
  console.log('✓ Faulty reprocess now renames batch ID')
} else console.error('✗ Faulty reprocess pattern not found')

// Fix partial update in faulty — use batchForId instead of fetching again
const OLD_PARTIAL_FETCH = `      // For partial: calculate remaining mtr and taka proportionally
      const totalKg = parseFloat(faulty_kg) || 0
      const ratio = totalKg > 0 ? remainKg / totalKg : 0
      // Fetch current batch values
      const { data: batchData } = await dbSelect('batches', { id: \`eq.\${batch_id}\` }, 'id,mtr,taka')
      const currentBatch = batchData?.[0] || {}`

const NEW_PARTIAL_FETCH = `      // For partial: calculate remaining mtr and taka proportionally
      const totalKg = parseFloat(faulty_kg) || 0
      const ratio = totalKg > 0 ? remainKg / totalKg : 0
      // Use already fetched batch data`

if (faulty.includes(OLD_PARTIAL_FETCH)) {
  faulty = faulty.replace(OLD_PARTIAL_FETCH, NEW_PARTIAL_FETCH)
  console.log('✓ Faulty partial: reuse fetched batch data')
} else console.error('✗ Faulty partial fetch pattern not found')

fs.writeFileSync('app/api/faulty/route.ts', faulty, 'utf8')

// Fix FOB API
let fob = fs.readFileSync('app/api/fob/route.ts', 'utf8')

// Add helper after imports
fob = fob.replace(
  `import { NextRequest, NextResponse } from 'next/server'\nimport { dbSelect, dbUpdate, dbInsert, sb, auditLog } from '@/lib/supabase'`,
  `import { NextRequest, NextResponse } from 'next/server'\nimport { dbSelect, dbUpdate, dbInsert, sb, auditLog } from '@/lib/supabase'

// Generate new batch ID for repairing: B2 → B2-R → B2-RR → B2-RRR
function getRepairingBatchId(currentBatchId: string): string {
  if (!currentBatchId) return currentBatchId
  const match = currentBatchId.match(/^(.+?)(-R+)$/)
  if (match) return match[1] + match[2] + 'R'
  return currentBatchId + '-R'
}`
)
console.log('✓ Added getRepairingBatchId helper to FOB API')

// Add batch ID rename in FOB reprocess
const OLD_FOB_REPROCESS = `    await dbInsert('repairing_orders', {
      batch_id, order_id: order_id||null,
      repair_kg: repairKg,
      repair_mtr:  isPartial ? (parseFloat(reprocess_mtr)||null) : null,
      repair_taka: isPartial ? (parseFloat(reprocess_taka)||null) : null,
      process_route: route, status:'pending',
      notes: reprocess_reason, source_type:'fob', reprocess_type,
    })

    if (!isPartial || remainKg <= 0) {
      await dbUpdate('batches', { id:batch_id }, {
        status:'repairing', current_process:null,
      })`

const NEW_FOB_REPROCESS = `    // Get current batch ID and generate new repairing batch ID
    const { data: batchForId } = await dbSelect('batches', { id: \`eq.\${batch_id}\` }, 'id,batch_id,mtr,taka')
    const currentBatch = batchForId?.[0] || {}
    const newBatchId = getRepairingBatchId(currentBatch.batch_id || '')

    // Update batch_id to repairing ID (e.g. DYE26-0003-B2 → DYE26-0003-B2-R)
    if (newBatchId) {
      await dbUpdate('batches', { id: batch_id }, { batch_id: newBatchId })
    }

    await dbInsert('repairing_orders', {
      batch_id, order_id: order_id||null,
      repair_kg: repairKg,
      repair_mtr:  isPartial ? (parseFloat(reprocess_mtr)||null) : null,
      repair_taka: isPartial ? (parseFloat(reprocess_taka)||null) : null,
      process_route: route, status:'pending',
      notes: reprocess_reason, source_type:'fob', reprocess_type,
    })

    if (!isPartial || remainKg <= 0) {
      await dbUpdate('batches', { id:batch_id }, {
        status:'repairing', current_process:null,
      })`

if (fob.includes(OLD_FOB_REPROCESS)) {
  fob = fob.replace(OLD_FOB_REPROCESS, NEW_FOB_REPROCESS)
  console.log('✓ FOB reprocess now renames batch ID')
} else console.error('✗ FOB reprocess pattern not found')

// Fix FOB partial — use already fetched batchForId
const OLD_FOB_PARTIAL = `      // For partial: calculate remaining mtr and taka proportionally
      // (FOB doesn't have pre-fetched batch - fetch now)
      const { data: batchData } = await dbSelect('batches', { id: \`eq.\${batch_id}\` }, 'id,mtr,taka')
      const currentBatch = batchData?.[0] || {}`

if (fob.includes(OLD_FOB_PARTIAL)) {
  fob = fob.replace(OLD_FOB_PARTIAL, `      // For partial: use already fetched batch data`)
  console.log('✓ FOB partial: reuse fetched batch data')
}

// Also add partial mtr/taka calc to FOB if missing
const OLD_FOB_REMAIN = `    if (!isPartial || remainKg <= 0) {
      await dbUpdate('batches', { id:batch_id }, {
        status:'repairing', current_process:null,
      })
    } else {
      await dbUpdate('batches', { id:batch_id }, {
        kg:remainKg,
        status: nextProcess ? 'in-process' : 'done',
        current_process: nextProcess||null,
        sent_at: new Date().toISOString(),
      })
    }`

const NEW_FOB_REMAIN = `    if (!isPartial || remainKg <= 0) {
      await dbUpdate('batches', { id:batch_id }, {
        status:'repairing', current_process:null,
      })
    } else {
      // Proportional mtr/taka for remaining batch
      const totalKg = parseFloat(fob_kg) || 0
      const ratio   = totalKg > 0 ? remainKg / totalKg : 0
      const remainMtr  = currentBatch.mtr  ? Math.round(currentBatch.mtr  * ratio * 10) / 10 : null
      const remainTaka = currentBatch.taka ? Math.round(currentBatch.taka * ratio) : null
      await dbUpdate('batches', { id:batch_id }, {
        kg:remainKg,
        ...(remainMtr  !== null ? { mtr:  remainMtr  } : {}),
        ...(remainTaka !== null ? { taka: remainTaka } : {}),
        status: nextProcess ? 'in-process' : 'done',
        current_process: nextProcess||null,
        sent_at: new Date().toISOString(),
      })
    }`

if (fob.includes(OLD_FOB_REMAIN)) {
  fob = fob.replace(OLD_FOB_REMAIN, NEW_FOB_REMAIN)
  console.log('✓ FOB partial: added proportional mtr/taka calculation')
} else console.error('✗ FOB remain pattern not found')

fs.writeFileSync('app/api/fob/route.ts', fob, 'utf8')
console.log('\n✓ All batch ID rename changes applied')
