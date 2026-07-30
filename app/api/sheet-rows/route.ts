import { NextRequest, NextResponse } from 'next/server'
import { dbSelect, dbInsert, dbUpdate, dbDelete, sb } from '@/lib/supabase'

function toClient(r: any) {
  return {
    id:                r.id,
    rowIndex:          r.row_index,
    party:             r.party             || '',
    subParty:          r.sub_party         || '',
    salesPerson:       r.sales_person      || '',
    article:           r.article           || '',
    blend:             r.blend             || '',
    width:             r.width             || '',
    gsm:               r.gsm               || '',
    color:             r.color             || '',
    labNo:             r.lab_no            || '',
    lotNo:             r.lot_no            || '',
    challanNo:         r.challan_no        || '',
    qtyKg:             r.qty_kg            ?? '',
    qtyMtr:            r.qty_mtr           ?? '',
    noOfTa:            r.no_of_taka        ?? '',
    typeOfFinish:      r.type_of_finish    || '',
    typeOfPacking:     r.type_of_packing   || '',
    remarks:           r.remarks           || '',
    holdReason:        r.hold_reason       || '',
    orderNumber:       r.order_number      || '',
    process:           r.process           || '',
    deliveryDate:      r.delivery_date     || '',
    currentStage:      r.current_stage     || '',
    approvalStatus:    r.approval_status   || 'draft',
    rejectionReason:   r.rejection_reason  || '',
    submittedOn:       r.submitted_on      || '',
    receivedAt:        r.received_at       || '',
    submitForApproval: r.submit_for_approval ?? false,
    requestEdit:       r.request_edit      ?? false,
    editHistory:       r.edit_history      || {},
    editRequestedOn:   r.edit_requested_on || '',
    isBatchRow:        r.is_batch_row      ?? false,
    updatedAt:         r.updated_at,
  }
}

function toDB(row: any, sheetId: string) {
  return {
    sheet_id:            sheetId,
    row_index:           row.rowIndex ?? row.row_index ?? 0,
    party:               row.party            || null,
    sub_party:           row.subParty         || null,
    sales_person:        row.salesPerson      || null,
    article:             row.article          || null,
    blend:               row.blend            || null,
    width:               row.width            || null,
    gsm:                 row.gsm              || null,
    color:               row.color            || null,
    lab_no:              row.labNo            || null,
    lot_no:              row.lotNo            || null,
    challan_no:          row.challanNo        || null,
    qty_kg:              row.qtyKg  !== '' && row.qtyKg  != null ? parseFloat(row.qtyKg)  : null,
    qty_mtr:             row.qtyMtr !== '' && row.qtyMtr != null ? parseFloat(row.qtyMtr) : null,
    no_of_taka:          row.noOfTa !== '' && row.noOfTa != null ? parseInt(row.noOfTa)   : null,
    type_of_finish:      row.typeOfFinish     || null,
    type_of_packing:     row.typeOfPacking    || null,
    remarks:             row.remarks          || null,
    hold_reason:         row.holdReason       || null,
    order_number:        row.orderNumber      || null,
    process:             row.process          || null,
    delivery_date:       row.deliveryDate     || null,
    current_stage:       row.currentStage     || null,
    approval_status:     row.approvalStatus   || 'draft',
    rejection_reason:    row.rejectionReason  || null,
    submitted_on:        row.submittedOn      || null,
    received_at:         row.receivedAt       || null,
    submit_for_approval: row.submitForApproval ?? false,
    request_edit:        row.requestEdit      ?? false,
    edit_history:        row.editHistory      || {},
    edit_requested_on:   row.editRequestedOn  || null,
    is_batch_row:        row.isBatchRow       ?? false,
    updated_at:          new Date().toISOString(),
  }
}

// GET /api/sheet-rows?sheet_id=X[&approval_status=Y]
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const sheet_id        = searchParams.get('sheet_id')
  const approval_status = searchParams.get('approval_status')

  if (!sheet_id) return NextResponse.json({ ok: false, error: 'sheet_id required' }, { status: 400 })

  const query: Record<string, string> = { sheet_id: `eq.${sheet_id}`, order: 'row_index.asc', limit: '5000' }
  if (approval_status) query['approval_status'] = `eq.${approval_status}`

  const { data, error } = await dbSelect('order_sheet_rows', query,
    'id,sheet_id,row_index,party,sub_party,sales_person,article,blend,width,gsm,color,' +
    'lab_no,lot_no,challan_no,qty_kg,qty_mtr,no_of_taka,type_of_finish,type_of_packing,' +
    'remarks,hold_reason,order_number,process,delivery_date,current_stage,approval_status,' +
    'rejection_reason,submitted_on,received_at,submit_for_approval,request_edit,' +
    'edit_history,edit_requested_on,is_batch_row,updated_at'
  )
  if (error) return NextResponse.json({ ok: false, error }, { status: 500 })
  return NextResponse.json({ ok: true, data: data.map(toClient) })
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { action } = body

  // ── Upsert one row ────────────────────────────────────────────────────────
  // KEY FIX: if row has an id → use PATCH (update by PK, always works)
  //          if no id         → use POST with conflict resolution (new row)
  if (action === 'upsert_row') {
    const { sheet_id, row } = body
    if (!sheet_id) return NextResponse.json({ ok: false, error: 'sheet_id required' }, { status: 400 })

    const dbRow = toDB(row, sheet_id)

    if (row.id) {
      // Existing row — update by UUID primary key (most reliable)
      const { error } = await dbUpdate('order_sheet_rows', { id: row.id }, {
        ...dbRow,
        // Don't overwrite sheet_id or row_index on update
        sheet_id:  undefined,
        row_index: undefined,
      })
      if (error) return NextResponse.json({ ok: false, error }, { status: 500 })
    } else {
      // New row — insert with conflict resolution on (sheet_id, row_index)
      const { error } = await sb('/order_sheet_rows', {
        method:  'POST',
        body:    JSON.stringify(dbRow),
        headers: { 'Prefer': 'resolution=merge-duplicates,return=minimal' },
      })
      if (error) return NextResponse.json({ ok: false, error }, { status: 500 })
    }
    return NextResponse.json({ ok: true })
  }

  // ── Bulk upsert ───────────────────────────────────────────────────────────
  if (action === 'bulk_upsert') {
    const { sheet_id, rows } = body
    if (!sheet_id || !Array.isArray(rows))
      return NextResponse.json({ ok: false, error: 'sheet_id and rows[] required' }, { status: 400 })

    const results = await Promise.all(rows.map(async (r: any, i: number) => {
      const dbRow = toDB({ ...r, rowIndex: r.rowIndex ?? r.row_index ?? i }, sheet_id)
      if (r.id) {
        // existing — patch by id
        const { error } = await dbUpdate('order_sheet_rows', { id: r.id }, {
          ...dbRow, sheet_id: undefined, row_index: undefined,
        })
        return error
      } else {
        // new — insert
        const { error } = await sb('/order_sheet_rows', {
          method: 'POST', body: JSON.stringify(dbRow),
          headers: { 'Prefer': 'resolution=merge-duplicates,return=minimal' },
        })
        return error
      }
    }))
    const errors = results.filter(Boolean)
    if (errors.length) return NextResponse.json({ ok: false, error: errors[0] }, { status: 500 })
    return NextResponse.json({ ok: true, upserted: rows.length })
  }

  // ── Add blank row ─────────────────────────────────────────────────────────
  if (action === 'add_row') {
    const { sheet_id, row_index } = body
    if (!sheet_id || row_index === undefined)
      return NextResponse.json({ ok: false, error: 'sheet_id and row_index required' }, { status: 400 })
    const { error } = await dbInsert('order_sheet_rows', {
      sheet_id, row_index, approval_status: 'draft', updated_at: new Date().toISOString(),
    })
    if (error) return NextResponse.json({ ok: false, error }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  // ── Delete one row ────────────────────────────────────────────────────────
  if (action === 'delete_row') {
    const { id } = body
    if (!id) return NextResponse.json({ ok: false, error: 'id required' }, { status: 400 })
    const { error } = await dbDelete('order_sheet_rows', { id })
    if (error) return NextResponse.json({ ok: false, error }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  // ── Update approval status only ───────────────────────────────────────────
  if (action === 'update_approval') {
    const { id, approval_status, order_number, rejection_reason, received_at } = body
    if (!id) return NextResponse.json({ ok: false, error: 'id required' }, { status: 400 })
    const patch: Record<string, any> = { approval_status, updated_at: new Date().toISOString() }
    if (order_number)     patch.order_number     = order_number
    if (rejection_reason) patch.rejection_reason = rejection_reason
    if (received_at)      patch.received_at      = received_at
    if (approval_status !== 'pending' && approval_status !== 'edit-request') {
      patch.submit_for_approval = false
      patch.request_edit        = false
    }
    const { error } = await dbUpdate('order_sheet_rows', { id }, patch)
    if (error) return NextResponse.json({ ok: false, error }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ ok: false, error: 'Unknown action' }, { status: 400 })
}
