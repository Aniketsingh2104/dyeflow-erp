import { NextRequest, NextResponse } from "next/server"
import { dbSelect, dbSelectIn, sb } from "@/lib/supabase"
import { canonicalCode } from "@/lib/processCodes"
import { guard } from "@/lib/access"
import { ensureTail } from '@/lib/routeTail'
import { MACHINE_REQUIRED, deriveMachineMap } from '@/lib/machineMap'

// batches.process_machine_map { D: id } → RouteAssignment's { D: [id] }
const mapToPm = (m: any): Record<string, string[]> => {
  const out: Record<string, string[]> = {}
  if (m && typeof m === 'object') for (const [k, v] of Object.entries(m)) if (v) out[k] = [String(v)]
  return out
}

export async function GET(req: NextRequest) {
  const g = await guard(req, 'repair-assign', 'GET')
  if (g.deny) return g.deny
  try {
    // Get ALL repairing orders (pending or In Repair)
    // only open repairs (closed ones can never be assigned); dbSelect pages past 1000 rows
    const { data: repairs, error: repErr } = await dbSelect("repairing_orders",
      { status: 'in.(pending,"In Repair")' },
      "id,batch_id,repair_kg,repair_mtr,repair_taka,source_type,reprocess_type,notes,status"
    )
    if (repErr) return NextResponse.json({ ok: false, error: repErr }, { status: 500 })

    // Get all batch IDs from repairing orders
    const batchIds = [...new Set((repairs || []).map((r: any) => r.batch_id).filter(Boolean))]
    if (!batchIds.length) return NextResponse.json({ ok: true, data: [] })

    // Fetch those batches (status = repairing OR pending = assigned but not yet in process)
    const { data: batches, error: bErr } = await dbSelectIn("batches", 'id', batchIds, "id,batch_id,sub_prod_no,kg,mtr,taka,status,process_route,process_machine_map,machine_id,supervisor_id,order_id,machines(id,name),supervisors(id,name)"
    )
    if (bErr) return NextResponse.json({ ok: false, error: bErr }, { status: 500 })

    // Build repair map — only OPEN repair orders (pending / In Repair).
    // A batch can have older, completed repair orders (B2-R → B2-RR); those
    // must not hide the current one.
    const repairMap: Record<string, any> = {}
    for (const r of repairs || []) {
      if (r.status === 'pending' || r.status === 'In Repair') repairMap[r.batch_id] = r
    }

    // Get order details
    const orderIds = [...new Set((batches || []).map((b: any) => b.order_id).filter(Boolean))]
    let orderMap: Record<string, any> = {}
    if (orderIds.length) {
      const { data: orders } = await dbSelectIn("orders", 'id', orderIds, "id,order_number,party,sub_party,sales_person,article,color,gsm,blend,width,lab_no,lot_no,challan_no,qty_mtr,no_of_taka,type_of_finish,type_of_packing,remarks,supervisors(id,name)"
      )
      for (const o of orders || []) orderMap[o.id] = o
    }

    // Only batches still waiting in repair (not yet split / sent on)
    const waiting = (batches || []).filter((b: any) => b.status === 'repairing' && repairMap[b.id])
    const enriched = waiting.map((b: any) => {
      const order  = orderMap[b.order_id] || {}
      const repair = repairMap[b.id]      || {}
      // A repair batch starts fresh: the route / machines it carried over from
      // the original batch don't matter. Only once the supervisor has assigned
      // them here ('In Repair') are they shown again.
      const assigned = repair.status === 'In Repair'
      return {
        ...b,
        process_route:    assigned ? (b.process_route || []) : [],
        machine_id:       assigned ? b.machine_id : null,
        machines:         assigned ? b.machines : null,
        process_machines: assigned ? mapToPm(b.process_machine_map) : {},
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
        machine_name:    (assigned && b.machines?.name) || "-",
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
  const g = await guard(req, 'repair-assign', body.action)
  if (g.deny) return g.deny
  const { action, batch_id, repair_id, supervisor_id, machine_id, process_route, process_machines } = body
  if (action === "assign") {
    if (!batch_id || !process_route?.length) {
      return NextResponse.json({ ok: false, error: "Pick a process route first." }, { status: 400 })
    }
    // a machine is needed only when the new route has a machine process (D, S, Wash …);
    // a route like F → Packing → Dispatch needs none
    const machineSteps = (process_route as string[]).map(c => canonicalCode(c)).filter(c => MACHINE_REQUIRED.includes(c))
    if (machineSteps.length && !machine_id) {
      return NextResponse.json({ ok: false, error: `Pick a machine for ${[...new Set(machineSteps)].join(', ')}.` }, { status: 400 })
    }
    // Only a batch that is waiting in repair (an open repairing order, batch
    // still 'repairing') can get a new route / machine here
    const { data: ros } = await dbSelect("repairing_orders",
      { batch_id: `eq.${batch_id}`, status: 'in.(pending,"In Repair")', limit: "1" }, "id")
    const ro = ros?.[0]
    if (!ro || (repair_id && ro.id !== repair_id)) {
      return NextResponse.json({ ok: false, stale: true, error: "This batch is no longer waiting in repair. Refresh the page." }, { status: 409 })
    }
    // a route always ends (Qa →) Packing → Dispatch — lib/routeTail.ts
    const route = ensureTail((process_route as string[]).map(c => canonicalCode(c)).filter(Boolean))
    const { data: rows, error: bErr } = await sb<any[]>("/batches", {
      method: "PATCH",
      params: { id: `eq.${batch_id}`, status: "eq.repairing" },
      // the old route / machine of the original batch are replaced completely
      body: JSON.stringify({
        supervisor_id: supervisor_id || null,
        machine_id: machineSteps.length ? machine_id : null,
        process_machine_map: deriveMachineMap(route, process_machines || null, machineSteps.length ? machine_id : null),
        process_route: route, updated_at: new Date().toISOString(),
      }),
    })
    if (bErr) return NextResponse.json({ ok: false, error: bErr }, { status: 500 })
    if (!Array.isArray(rows) || !rows.length) {
      return NextResponse.json({ ok: false, stale: true, error: "This batch is no longer waiting in repair. Refresh the page." }, { status: 409 })
    }
    await sb("/repairing_orders", { method: "PATCH", params: { id: `eq.${ro.id}`, status: 'in.(pending,"In Repair")' },
      body: JSON.stringify({ status: "In Repair", process_route: route }), headers: { "Prefer": "return=minimal" } })
    return NextResponse.json({ ok: true })
  }
  return NextResponse.json({ ok: false, error: "Unknown action" }, { status: 400 })
}
