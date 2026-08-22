const fs = require('fs')
const filePath = 'app/api/repairing-orders/route.ts'
let c = fs.readFileSync(filePath, 'utf8')

const OLD_GET = `export async function GET() {
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

const NEW_GET = `export async function GET() {
  try {
    // Only select columns that exist in repairing_orders table
    const { data: records, error } = await dbSelect('repairing_orders',
      { order: 'created_at.desc', limit: '1000' },
      'id,batch_id,order_id,faulty_id,repair_kg,repair_mtr,repair_taka,process_route,status,notes,source_type,reprocess_type,created_at,updated_at'
    )
    if (error) return NextResponse.json({ ok: false, error }, { status: 500 })

    // Enrich with batch and order details via UUID joins
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
        // Batch fields
        batch_id_str:    batch.batch_id        || '-',
        machine:         batch.machines?.name  || '-',
        // Order fields
        order_number:    order.order_number    || '-',
        party:           order.party           || '-',
        sub_party:       order.sub_party       || '-',
        article:         order.article         || '-',
        blend:           order.blend           || '-',
        gsm:             order.gsm             || '-',
        color:           order.color           || '-',
        lab_no:          order.lab_no          || '-',
        challan_no:      order.challan_no      || '-',
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

if (c.includes(OLD_GET)) {
  c = c.replace(OLD_GET, NEW_GET)
  fs.writeFileSync(filePath, c, 'utf8')
  console.log('✓ Fixed: repairing-orders API only selects columns that exist in the table')
} else {
  console.error('✗ Pattern not found')
  // Check what GET looks like
  const i = c.indexOf('async function GET')
  console.log('Current:', c.substring(i, i+300))
}
