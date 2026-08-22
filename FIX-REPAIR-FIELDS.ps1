Set-Location "C:\dyeflow-react"

$content = @'
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
        "id,order_number,party,sub_party,article,color,gsm,blend,width,lab_no,lot_no,challan_no,qty_mtr,no_of_taka,type_of_finish,type_of_packing,remarks,supervisors(id,name)"
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
'@

Set-Content -Path "app/api/repair-assign/route.ts" -Value $content -Encoding UTF8
Write-Host "Updated /api/repair-assign/route.ts with all fields" -ForegroundColor Green

# Now update the supervisor page table to show all fields
$supPage = Get-Content "app/supervisor/[name]/page.tsx" -Raw

$oldTable = @"
                <thead style={{ position: 'sticky', top: 0, zIndex: 10, background: '#FFF5F5' }}>
                  <tr>
                    {['BATCH #','ORDER #','PARTY','COLOR','ARTICLE','BLEND','GSM',
                      'REPAIR KG','SOURCE','TYPE','NOTES','ASSIGN'].map(h => (
                      <th key={h} style={headerStyle}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {faultyBatches.map((r: any, idx: number) => (
                    <tr key={r.id || idx} style={{ background: idx%2===0?'white':'#FFF5F5',
                      borderBottom: '1px solid #FEE2E2' }}>
                      <td style={{ ...cellStyle, fontWeight: 700, color: '#DC2626' }}>
                        {r.batch_id || '-'}
                      </td>
                      <td style={{ ...cellStyle, fontWeight: 700, color: '#2563EB' }}>
                        {r.order_number || '-'}
                      </td>
                      <td style={cellStyle}>{r.party || '-'}</td>
                      <td style={{ ...cellStyle, color: '#2563EB' }}>{r.color || '-'}</td>
                      <td style={cellStyle}>{r.article || '-'}</td>
                      <td style={{ ...cellStyle, color: '#D97706' }}>{r.blend || '-'}</td>
                      <td style={{ ...cellStyle, fontWeight: 700, color: '#2563EB' }}>{r.gsm || '-'}</td>
                      <td style={{ ...cellStyle, fontWeight: 700, color: '#DC2626' }}>
                        {r.repair_kg || r.kg || 0} Kg
                      </td>
                      <td style={cellStyle}>
                        <span style={{ fontSize:11, fontWeight:700, padding:'2px 7px', borderRadius:4,
                          background: r.source_type==='fob'?'#F3E8FF':'#FEE2E2',
                          color: r.source_type==='fob'?'#7C3AED':'#DC2626' }}>
                          {r.source_type || 'faulty'}
                        </span>
                      </td>
                      <td style={cellStyle}>
                        <span style={{ fontSize:11, fontWeight:600, padding:'2px 7px', borderRadius:4,
                          background: r.reprocess_type==='partial'?'#FEF3C7':'#F3F4F6',
                          color: r.reprocess_type==='partial'?'#D97706':'#6B7280' }}>
                          {r.reprocess_type || 'full'}
                        </span>
                      </td>
                      <td style={{ ...cellStyle, fontSize: 11, maxWidth: 160 }}>
                        {r.repair_notes || '-'}
                      </td>
                      <td style={{ ...cellStyle }}>
                        <RouteAssignment
                          order={{
                            ...r,
                            id: r.id,
                            batch_id: r.id,
                            repair_id: r.repair_id,
                            isRepair: true,
                          }}
                          onUpdate={loadData}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
"@

$newTable = @"
                <thead style={{ position: 'sticky', top: 0, zIndex: 10, background: '#FFF5F5' }}>
                  <tr>
                    {['BATCH #','ORDER #','PARTY','SUB PARTY','ARTICLE','BLEND','GSM',
                      'COLOR','LAB NO.','CHALLAN NO.','REPAIR KG','REPAIR MTR','TAKA',
                      'FINISH','PACKING','SOURCE','TYPE','NOTES','ASSIGN'].map(h => (
                      <th key={h} style={headerStyle}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {faultyBatches.map((r: any, idx: number) => (
                    <tr key={r.id || idx} style={{ background: idx%2===0?'white':'#FFF5F5',
                      borderBottom: '1px solid #FEE2E2' }}>
                      <td style={{ ...cellStyle, fontWeight: 700, color: '#DC2626' }}>{r.batch_id || '-'}</td>
                      <td style={{ ...cellStyle, fontWeight: 700, color: '#2563EB' }}>{r.order_number || '-'}</td>
                      <td style={{ ...cellStyle, color: '#2563EB', fontWeight: 600 }}>{r.party || '-'}</td>
                      <td style={cellStyle}>{r.sub_party || '-'}</td>
                      <td style={{ ...cellStyle, fontWeight: 500 }}>{r.article || '-'}</td>
                      <td style={{ ...cellStyle, color: '#D97706' }}>{r.blend || '-'}</td>
                      <td style={{ ...cellStyle, fontWeight: 700, color: '#2563EB' }}>{r.gsm || '-'}</td>
                      <td style={{ ...cellStyle, color: '#2563EB' }}>{r.color || '-'}</td>
                      <td style={{ ...cellStyle, fontSize: 11, color: '#2563EB' }}>{r.lab_no || '-'}</td>
                      <td style={{ ...cellStyle, fontSize: 11, color: '#2563EB' }}>{r.challan_no || '-'}</td>
                      <td style={{ ...cellStyle, fontWeight: 700, color: '#DC2626' }}>{r.repair_kg || r.kg || 0} Kg</td>
                      <td style={{ ...cellStyle, fontWeight: 600, color: '#2563EB' }}>{r.repair_mtr || r.qty_mtr || '-'}</td>
                      <td style={{ ...cellStyle, fontWeight: 600, color: '#2563EB' }}>{r.repair_taka || r.no_of_taka || '-'}</td>
                      <td style={cellStyle}>{r.type_of_finish || '-'}</td>
                      <td style={{ ...cellStyle, color: '#2563EB' }}>{r.type_of_packing || '-'}</td>
                      <td style={cellStyle}>
                        <span style={{ fontSize:11, fontWeight:700, padding:'2px 7px', borderRadius:4,
                          background: r.source_type==='fob'?'#F3E8FF':'#FEE2E2',
                          color: r.source_type==='fob'?'#7C3AED':'#DC2626' }}>
                          {r.source_type || 'faulty'}
                        </span>
                      </td>
                      <td style={cellStyle}>
                        <span style={{ fontSize:11, fontWeight:600, padding:'2px 7px', borderRadius:4,
                          background: r.reprocess_type==='partial'?'#FEF3C7':'#F3F4F6',
                          color: r.reprocess_type==='partial'?'#D97706':'#6B7280' }}>
                          {r.reprocess_type || 'full'}
                        </span>
                      </td>
                      <td style={{ ...cellStyle, fontSize: 11, maxWidth: 160 }}>{r.repair_notes || '-'}</td>
                      <td style={{ ...cellStyle }}>
                        <RouteAssignment
                          order={{
                            ...r,
                            id: r.id,
                            batch_id: r.id,
                            repair_id: r.repair_id,
                            isRepair: true,
                          }}
                          onUpdate={loadData}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
"@

if ($supPage -match [regex]::Escape($oldTable.Substring(0,50))) {
  $supPage = $supPage.Replace($oldTable, $newTable)
  Set-Content -Path "app/supervisor/[name]/page.tsx" -Value $supPage -Encoding UTF8
  Write-Host "Updated Supervisor page table with all fields" -ForegroundColor Green
} else {
  Write-Host "Pattern not found - checking file..." -ForegroundColor Yellow
}

git add app/api/repair-assign/route.ts
git add "app/supervisor/[name]/page.tsx"
git commit -m "fix: Repair Queue shows all fields - Batch#, Order#, Party, SubParty, Article, Blend, GSM, Color, LabNo, ChallanNo, RepairKG, RepairMTR, Taka, Finish, Packing, Source, Type, Notes, Assign; API fetches all order fields"
git push origin main
Write-Host "DONE! Wait 90s then refresh Supervisor page." -ForegroundColor Green
