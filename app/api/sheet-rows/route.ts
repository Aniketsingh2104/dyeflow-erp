import { NextRequest, NextResponse } from 'next/server'
import { dbSelect, dbUpdate, dbDelete, sb } from '@/lib/supabase'

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

// Fields only the office (Pending Approvals) may set — a party's sheet never writes them
const OFFICE_FIELDS = ['order_number', 'rejection_reason', 'hold_reason', 'process', 'delivery_date', 'current_stage']

// Status changes a party's sheet is allowed to make: `${inDb}>${new}`.
// Anything else means the office changed the row since the sheet loaded it.
const SHEET_MOVES = new Set([
  'draft>pending', 'rejected>pending', 'pending>draft',
  'approved>edit-request', 'edit-accepted>edit-request', 'edit-request>approved',
])

/**
 * Insert a NEW row at the end of the sheet. The server picks row_index
 * (last + 1) — never the browser — so a new row can't land on, and merge
 * over, an existing row after rows were deleted. Returns the new id.
 */
async function insertRow(sheetId: string, dbRow: Record<string, any>) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const { data: last } = await dbSelect('order_sheet_rows',
      { sheet_id: `eq.${sheetId}`, order: 'row_index.desc', limit: '1' }, 'row_index')
    const next = last?.length ? (Number(last[0].row_index) || 0) + 1 : 0
    const { data, error, status } = await sb<any[]>('/order_sheet_rows', {
      method: 'POST', body: JSON.stringify({ ...dbRow, sheet_id: sheetId, row_index: next }),
      headers: { 'Prefer': 'return=representation' },
    })
    if (!error) return { id: (data as any[])?.[0]?.id as string, row_index: next, error: null }
    if (status !== 409) return { id: null, row_index: null, error }
    // 409 = someone else just took that row_index — try the next one
  }
  return { id: null, row_index: null, error: 'Could not add the row — please try again' }
}

/** Save one row. Existing rows are patched by id; rows without an id are inserted. */
async function saveOne(sheetId: string, row: any, fromSheet: boolean) {
  const dbRow: Record<string, any> = toDB(row, sheetId)
  delete dbRow.sheet_id
  delete dbRow.row_index

  if (row.id) {
    const { data: cur } = await dbSelect('order_sheet_rows', { id: `eq.${row.id}`, limit: '1' },
      'id,sheet_id,approval_status')
    const inDb = cur?.[0]
    if (inDb) {
      if (inDb.sheet_id !== sheetId) return { status: 400, error: 'Row belongs to another sheet' }
      if (fromSheet) {
        for (const f of OFFICE_FIELDS) delete dbRow[f]
        const was = inDb.approval_status || 'draft'
        const now = dbRow.approval_status || 'draft'
        if (was !== now && !SHEET_MOVES.has(`${was}>${now}`)) {
          return { status: 409, error: `This row was updated by the office (now "${was}"). Reload the sheet to see the latest.` }
        }
        if (was === 'rejected' && now === 'pending') dbRow.rejection_reason = null   // resubmitted after fixing
      }
      const { error } = await dbUpdate('order_sheet_rows', { id: row.id }, dbRow)
      return error ? { status: 500, error } : { status: 200, id: row.id }
    }
    // The row was deleted elsewhere — fall through and add it back as a new row
  }
  if (fromSheet) {
    for (const f of OFFICE_FIELDS) delete dbRow[f]
    // a party's new row starts as a draft or is submitted — nothing else
    if (dbRow.approval_status !== 'pending') { dbRow.approval_status = 'draft'; dbRow.submit_for_approval = false }
  }
  const ins = await insertRow(sheetId, dbRow)
  return ins.error ? { status: 500, error: ins.error } : { status: 200, id: ins.id, row_index: ins.row_index }
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { action } = body
  // Anyone who isn't an admin saves under the party-sheet rules (no office
  // fields, only the allowed status moves). Decided from the signed-in role,
  // not from anything the browser sends.
  const fromSheet = req.headers.get('x-dyeflow-role') !== 'admin'

  // ── Save one row (new rows return their id) ───────────────────────────────
  if (action === 'upsert_row') {
    const { sheet_id, row } = body
    if (!sheet_id || !row) return NextResponse.json({ ok: false, error: 'sheet_id and row required' }, { status: 400 })
    const r = await saveOne(sheet_id, row, fromSheet)
    if (r.error) return NextResponse.json({ ok: false, error: r.error }, { status: r.status })
    return NextResponse.json({ ok: true, id: r.id, row_index: (r as any).row_index ?? null })
  }

  // ── Bulk save (one-time copy of a legacy sheet) — in order, one by one ────
  if (action === 'bulk_upsert') {
    const { sheet_id, rows } = body
    if (!sheet_id || !Array.isArray(rows))
      return NextResponse.json({ ok: false, error: 'sheet_id and rows[] required' }, { status: 400 })
    const { data: existing } = await dbSelect('order_sheet_rows', { sheet_id: `eq.${sheet_id}`, limit: '1' }, 'id')
    if (!existing?.length) {
      // Empty sheet = one-time copy of a legacy sheet. The rows are read from
      // the sheet's own saved copy (order_sheets.rows) on the server — not
      // taken from the browser — numbered 0..n and inserted in a few large
      // requests, so the copy can't time out halfway.
      const { data: sh } = await dbSelect('order_sheets', { id: `eq.${sheet_id}`, limit: '1' }, 'id,rows')
      const legacy: any[] = Array.isArray(sh?.[0]?.rows) ? sh[0].rows : []
      const all = legacy.map((r: any, i: number) => ({ ...toDB({ ...r, id: undefined }, sheet_id), row_index: i }))
      for (let i = 0; i < all.length; i += 500) {
        const { error } = await sb('/order_sheet_rows', {
          method: 'POST', body: JSON.stringify(all.slice(i, i + 500)),
          headers: { 'Prefer': 'return=minimal' },
        })
        if (error) return NextResponse.json({ ok: false, error }, { status: 500 })
      }
      return NextResponse.json({ ok: true, upserted: all.length })
    }
    for (const r of rows) {
      const res = await saveOne(sheet_id, r, fromSheet)
      if (res.error) return NextResponse.json({ ok: false, error: res.error }, { status: res.status })
    }
    return NextResponse.json({ ok: true, upserted: rows.length })
  }

  // ── Add blank row ─────────────────────────────────────────────────────────
  if (action === 'add_row') {
    const { sheet_id } = body
    if (!sheet_id) return NextResponse.json({ ok: false, error: 'sheet_id required' }, { status: 400 })
    const ins = await insertRow(sheet_id, { approval_status: 'draft', updated_at: new Date().toISOString() })
    if (ins.error) return NextResponse.json({ ok: false, error: ins.error }, { status: 500 })
    return NextResponse.json({ ok: true, id: ins.id, row_index: ins.row_index })
  }

  // ── Delete one row ────────────────────────────────────────────────────────
  if (action === 'delete_row') {
    const { id } = body
    if (!id) return NextResponse.json({ ok: false, error: 'id required' }, { status: 400 })
    // A row that already became an order (or is waiting for approval) can't be
    // deleted from a party sheet — only an admin can remove it.
    const { data: cur } = await dbSelect('order_sheet_rows', { id: `eq.${id}`, limit: '1' }, 'id,approval_status,order_number')
    const r = cur?.[0]
    if (!r) return NextResponse.json({ ok: true })   // already gone
    const st = r.approval_status || 'draft'
    if ((r.order_number || !['draft', 'rejected'].includes(st)) && req.headers.get('x-dyeflow-role') !== 'admin') {
      return NextResponse.json({ ok: false, error: `This row is "${st}"${r.order_number ? ` (order ${r.order_number})` : ''} — ask the office to remove it.` }, { status: 403 })
    }
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
