import { NextRequest, NextResponse } from "next/server"
import { dbSelect, dbUpdate } from "@/lib/supabase"

export async function GET() {
  try {
    const { data: batches, error } = await dbSelect("batches",
      { status: "eq.repairing", limit: "1000" },
      "id,batch_id,kg,mtr,taka,status,process_route,machine_id,supervisor_id,order_id,machines(id,name),supervisors(id,name)"
    )
    if (error) return NextResponse.json({ ok: false, error }, { status: 500 })

    const orderIds = [...new Set((batches || []).map((b: any) => b.order_id).filter(Boolean))]
    let orderMap: Record<string, any> = {}
    if (orderIds.length) {
      const { data: orders } = await dbSelect("orders",
        { id: `in.(${orderIds.join(",")})`, limit: "1000" },
        "id,order_number,party,sub_party,sales_person,article,color,gsm,blend,width,lab_no,lot_no,challan_no,qty_mtr,no_of_taka,type_of_finish,type_of_packing,remarks,supervisors(id,name)"
      )
      for (const o of orders || []) orderMap[o.id] = o
    }

    const { data: repairs } = await dbSelect("repairing_orders",
      { status: "eq.pending", limit: "1000" },
      "id,batch_id,repair_kg,repair_mtr,repair_taka,source_type,reprocess_type,notes"
    )
    const repairMap: Record<string, any> = {}
    for (const r of repairs || []) repairMap[r.batch_id] = r

    const enriched = (batches || []).map((b: any) => {
      const order  = orderMap[b.order_id] || {}
      const repair = repairMap[b.id]      || {}
      return {
        ...b,
        order_number:     order.order_number     || "-",
        party:            order.party            || "-",
        sub_party:        order.sub_party        || "-",
        article:          order.article          || "-",
        color:            order.color            || "-",
        gsm:              order.gsm              || "-",
        blend:            order.blend            || "-",
        width:            order.width            || "-",
        lab_no:           order.lab_no           || "-",
        lot_no:           order.lot_no           || "-",
        challan_no:       order.challan_no       || "-",
        qty_mtr:          b.mtr || order.qty_mtr || "-",
        no_of_taka:       b.taka || order.no_of_taka || "-",
        type_of_finish:   order.type_of_finish   || "-",
        type_of_packing:  order.type_of_packing  || "-",
        remarks:          order.remarks          || "-",
        machine_name:     b.machines?.name       || "-",
        supervisor_name:  b.supervisors?.name || order.supervisors?.name || "-",
        repair_id:        repair.id              || null,
        repair_kg:        repair.repair_kg       || b.kg,
        repair_mtr:       repair.repair_mtr      || "-",
        repair_taka:      repair.repair_taka     || "-",
        source_type:      repair.source_type     || "-",
        reprocess_type:   repair.reprocess_type  || "-",
        repair_notes:     repair.notes           || "-",
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

