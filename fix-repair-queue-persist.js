const fs = require('fs')

// Fix 1: repair-assign API — fetch both 'repairing' AND 'pending' batches that have repairing orders
const apiContent = `import { NextRequest, NextResponse } from "next/server"
import { dbSelect, dbUpdate } from "@/lib/supabase"

export async function GET() {
  try {
    // Get ALL repairing orders (pending or In Repair)
    const { data: repairs, error: repErr } = await dbSelect("repairing_orders",
      { limit: "1000" },
      "id,batch_id,repair_kg,repair_mtr,repair_taka,source_type,reprocess_type,notes,status"
    )
    if (repErr) return NextResponse.json({ ok: false, error: repErr }, { status: 500 })

    // Get all batch IDs from repairing orders
    const batchIds = [...new Set((repairs || []).map((r: any) => r.batch_id).filter(Boolean))]
    if (!batchIds.length) return NextResponse.json({ ok: true, data: [] })

    // Fetch those batches (status = repairing OR pending = assigned but not yet in process)
    const { data: batches, error: bErr } = await dbSelect("batches",
      { id: \`in.(\${batchIds.join(",")})\`, limit: "1000" },
      "id,batch_id,kg,mtr,taka,status,process_route,machine_id,supervisor_id,order_id,machines(id,name),supervisors(id,name)"
    )
    if (bErr) return NextResponse.json({ ok: false, error: bErr }, { status: 500 })

    // Build repair map
    const repairMap: Record<string, any> = {}
    for (const r of repairs || []) repairMap[r.batch_id] = r

    // Get order details
    const orderIds = [...new Set((batches || []).map((b: any) => b.order_id).filter(Boolean))]
    let orderMap: Record<string, any> = {}
    if (orderIds.length) {
      const { data: orders } = await dbSelect("orders",
        { id: \`in.(\${orderIds.join(",")})\`, limit: "1000" },
        "id,order_number,party,sub_party,sales_person,article,color,gsm,blend,width,lab_no,lot_no,challan_no,qty_mtr,no_of_taka,type_of_finish,type_of_packing,remarks,supervisors(id,name)"
      )
      for (const o of orders || []) orderMap[o.id] = o
    }

    const enriched = (batches || []).map((b: any) => {
      const order  = orderMap[b.order_id] || {}
      const repair = repairMap[b.id]      || {}
      return {
        ...b,
        order_number:    order.order_number     || "-",
        party:           order.party            || "-",
        sub_party:       order.sub_party        || "-",
        sales_person:    order.sales_person     || "-",
        article:         order.article          || "-",
        color:           order.color            || "-",
        gsm:             order.gsm              || "-",
        blend:           order.blend            || "-",
        width:           order.width            || "-",
        lab_no:          order.lab_no           || "-",
        lot_no:          order.lot_no           || "-",
        challan_no:      order.challan_no       || "-",
        qty_mtr:         b.mtr || order.qty_mtr || "-",
        no_of_taka:      b.taka || order.no_of_taka || "-",
        type_of_finish:  order.type_of_finish   || "-",
        type_of_packing: order.type_of_packing  || "-",
        remarks:         order.remarks          || "-",
        machine_name:    b.machines?.name       || "-",
        supervisor_name: b.supervisors?.name || order.supervisors?.name || "-",
        repair_id:       repair.id              || null,
        repair_kg:       repair.repair_kg       || b.kg,
        repair_mtr:      repair.repair_mtr      || "-",
        repair_taka:     repair.repair_taka     || "-",
        source_type:     repair.source_type     || "-",
        reprocess_type:  repair.reprocess_type  || "-",
        repair_notes:    repair.notes           || "-",
        ro_status:       repair.status          || "pending", // repairing order status
      }
    })

    return NextResponse.json({ ok: true, data: enriched })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { action, batch_id, repair_id, supervisor_id, machine_id, process_route } = body
  if (action === "assign") {
    if (!batch_id || !machine_id || !process_route?.length) {
      return NextResponse.json({ ok: false, error: "batch_id, machine_id, process_route required" }, { status: 400 })
    }
    const { error: bErr } = await dbUpdate("batches", { id: batch_id }, {
      supervisor_id:   supervisor_id || null,
      machine_id,
      process_route,
      status:          "pending",
      current_process: null,
    })
    if (bErr) return NextResponse.json({ ok: false, error: bErr }, { status: 500 })
    if (repair_id) {
      await dbUpdate("repairing_orders", { id: repair_id }, { status: "In Repair" })
    }
    return NextResponse.json({ ok: true })
  }
  return NextResponse.json({ ok: false, error: "Unknown action" }, { status: 400 })
}
`
fs.writeFileSync('app/api/repair-assign/route.ts', apiContent, 'utf8')
console.log('✓ repair-assign API updated — fetches both repairing and pending batches')

// Fix 2: Supervisor page — show both unassigned and assigned repair batches
// Change filter from status='repairing' to show ALL batches from repairing orders
const supPath = 'app/supervisor/[name]/page.tsx'
let sup = fs.readFileSync(supPath, 'utf8')

const OLD_FILTER = `      // All pending repair batches (not filtered by supervisor — supervisor picks any)
      const pendingRepairs: any[] = (repairApiRes.data || []).filter((b: any) =>
        b.status === 'repairing'
      )

      setFaultyBatches(pendingRepairs)
      setStats({ inbox, faulty: pendingRepairs.length })`

const NEW_FILTER = `      // Show ALL repair batches — both unassigned (repairing) and assigned (pending/In Repair)
      const allRepairs: any[] = repairApiRes.data || []
      setFaultyBatches(allRepairs)
      setStats({ inbox, faulty: allRepairs.length })`

if (sup.includes(OLD_FILTER)) {
  sup = sup.replace(OLD_FILTER, NEW_FILTER)
  console.log('✓ Supervisor page shows all repair batches (assigned + unassigned)')
} else console.error('✗ Filter pattern not found')

// Fix 3: Add assigned status badge in the Assign column
const OLD_ASSIGN_COL = `                      <td style={cellStyle}>
                        <RouteAssignment
                          order={{ ...r, id:r.id, batch_id:r.id, repair_id:r.repair_id, isRepair:true }}
                          onUpdate={loadData}
                        />
                      </td>`

const NEW_ASSIGN_COL = `                      <td style={cellStyle}>
                        {r.ro_status === 'In Repair' ? (
                          <div>
                            <span style={{ display:'block', fontSize:11, fontWeight:700,
                              padding:'3px 8px', borderRadius:4, background:'#DCFCE7',
                              color:'#166534', marginBottom:4 }}>
                              ✓ Assigned
                            </span>
                            <span style={{ fontSize:10, color:'#6B7280' }}>
                              {r.machine_name !== '-' ? r.machine_name : ''}
                            </span>
                          </div>
                        ) : (
                          <RouteAssignment
                            order={{ ...r, id:r.id, batch_id:r.id, repair_id:r.repair_id, isRepair:true }}
                            onUpdate={loadData}
                          />
                        )}
                      </td>`

if (sup.includes(OLD_ASSIGN_COL)) {
  sup = sup.replace(OLD_ASSIGN_COL, NEW_ASSIGN_COL)
  console.log('✓ Assign column shows "✓ Assigned" badge for already assigned batches')
} else console.error('✗ Assign column pattern not found')

fs.writeFileSync(supPath, sup, 'utf8')
console.log('\n✓ All fixes applied')
