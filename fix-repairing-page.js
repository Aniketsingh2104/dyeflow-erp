const fs = require('fs')

// Fix 1: Update /api/repairing-orders to join batches and orders
let repApiPath = 'app/api/repairing-orders/route.ts'
let repApi = fs.readFileSync(repApiPath, 'utf8')

// Check what select string is used
const hasJoin = repApi.includes('batch_id_str') || repApi.includes('orderMap')
console.log('Has join:', hasJoin)

// Find the GET handler and add enrichment
const OLD_GET = `export async function GET() {
  const { data, error } = await dbSelect('repairing_orders', { order: 'created_at.desc', limit: '1000' }, '*')
  if (error) return NextResponse.json({ ok: false, error }, { status: 500 })
  return NextResponse.json({ ok: true, data })
}`

const NEW_GET = `export async function GET() {
  try {
    const { data: records, error } = await dbSelect('repairing_orders',
      { order: 'created_at.desc', limit: '1000' },
      'id,batch_id,order_id,order_number,party,repair_kg,repair_mtr,repair_taka,process_route,status,notes,source_type,reprocess_type,created_at,updated_at'
    )
    if (error) return NextResponse.json({ ok: false, error }, { status: 500 })

    // Enrich with batch and order details
    const batchIds = [...new Set((records||[]).map((r:any)=>r.batch_id).filter(Boolean))]
    const orderIds = [...new Set((records||[]).map((r:any)=>r.order_id).filter(Boolean))]
    let batchMap:Record<string,any> = {}
    let orderMap:Record<string,any> = {}

    if (batchIds.length) {
      const { data:batches } = await dbSelect('batches',
        { id:\`in.(\${batchIds.join(',')})\`, limit:'2000' },
        'id,batch_id,kg,mtr,taka,machines(id,name)'
      )
      for (const b of batches||[]) batchMap[b.id] = b
    }
    if (orderIds.length) {
      const { data:orders } = await dbSelect('orders',
        { id:\`in.(\${orderIds.join(',')})\`, limit:'2000' },
        'id,order_number,party,sub_party,article,blend,width,gsm,color,lab_no,lot_no,challan_no,type_of_finish,type_of_packing,supervisors(id,name)'
      )
      for (const o of orders||[]) orderMap[o.id] = o
    }

    const enriched = (records||[]).map((r:any) => {
      const batch = batchMap[r.batch_id] || {}
      const order = orderMap[r.order_id] || {}
      return {
        ...r,
        batch_id_str:    batch.batch_id  || r.batch_id,
        machine:         batch.machines?.name || '-',
        order_number:    order.order_number || r.order_number,
        party:           order.party       || r.party,
        sub_party:       order.sub_party   || '-',
        article:         order.article     || '-',
        blend:           order.blend       || '-',
        gsm:             order.gsm         || '-',
        color:           order.color       || '-',
        lab_no:          order.lab_no      || '-',
        challan_no:      order.challan_no  || '-',
        type_of_finish:  order.type_of_finish  || '-',
        type_of_packing: order.type_of_packing || '-',
        supervisor:      order.supervisors?.name || '-',
      }
    })

    return NextResponse.json({ ok: true, data: enriched })
  } catch (err:any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}`

if (repApi.includes(OLD_GET)) {
  repApi = repApi.replace(OLD_GET, NEW_GET)
  fs.writeFileSync(repApiPath, repApi, 'utf8')
  console.log('✓ /api/repairing-orders GET now enriches with batch and order data')
} else {
  console.error('✗ GET pattern not found in repairing-orders API')
  // Check what's there
  const i = repApi.indexOf('async function GET')
  console.log('Current GET:', repApi.substring(i, i+200))
}

// Fix 2: Update partial reprocess to also update mtr and taka proportionally
// In both /api/faulty and /api/fob

const files = ['app/api/faulty/route.ts', 'app/api/fob/route.ts']
files.forEach(filePath => {
  let c = fs.readFileSync(filePath, 'utf8')
  
  // Fix batch update in partial reprocess to include mtr and taka
  const OLD_PARTIAL = `    if (!isPartial || remainKg <= 0) {
      await dbUpdate('batches', { id: batch_id }, {
        is_faulty:false, status:'repairing', current_process:null,
      })
    } else {
      await dbUpdate('batches', { id: batch_id }, {
        is_faulty:false, kg:remainKg,
        status: nextProcess ? 'in-process' : 'done',
        current_process: nextProcess||null,
        sent_at: new Date().toISOString(),
      })
    }`

  const NEW_PARTIAL = `    if (!isPartial || remainKg <= 0) {
      await dbUpdate('batches', { id: batch_id }, {
        is_faulty:false, status:'repairing', current_process:null,
      })
    } else {
      // For partial: calculate remaining mtr and taka proportionally
      const totalKg = parseFloat(${filePath.includes('faulty') ? 'faulty_kg' : 'fob_kg'}) || 0
      const ratio = totalKg > 0 ? remainKg / totalKg : 0
      // Fetch current batch values
      const { data: batchData } = await dbSelect('batches', { id: \`eq.\${batch_id}\` }, 'id,mtr,taka')
      const currentBatch = batchData?.[0] || {}
      const remainMtr  = currentBatch.mtr  ? Math.round(currentBatch.mtr  * ratio * 10) / 10 : null
      const remainTaka = currentBatch.taka ? Math.round(currentBatch.taka * ratio) : null
      await dbUpdate('batches', { id: batch_id }, {
        is_faulty:false, kg:remainKg,
        ...(remainMtr  !== null ? { mtr:  remainMtr  } : {}),
        ...(remainTaka !== null ? { taka: remainTaka } : {}),
        status: nextProcess ? 'in-process' : 'done',
        current_process: nextProcess||null,
        sent_at: new Date().toISOString(),
      })
    }`

  if (c.includes(OLD_PARTIAL)) {
    c = c.replace(OLD_PARTIAL, NEW_PARTIAL)
    
    // Also need to import dbSelect if not already there
    if (!c.includes('dbSelect')) {
      c = c.replace(
        `import { dbSelect, dbUpdate, dbInsert, sb, auditLog } from '@/lib/supabase'`,
        `import { dbSelect, dbUpdate, dbInsert, sb, auditLog } from '@/lib/supabase'`
      )
    }
    fs.writeFileSync(filePath, c, 'utf8')
    console.log(`✓ ${filePath}: partial reprocess now updates mtr/taka proportionally`)
  } else {
    console.error(`✗ Partial reprocess pattern not found in ${filePath}`)
  }
})
