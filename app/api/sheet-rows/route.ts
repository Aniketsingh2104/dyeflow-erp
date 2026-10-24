import { NextRequest, NextResponse } from 'next/server'
import { dbSelect, dbUpdate, dbDelete, sb, auditLog } from '@/lib/supabase'
import { guard, canUseSheet, isSheetOffice } from '@/lib/access'
import { createOrder, nextOrderNumber } from '@/lib/orderCreate'

const NO_SHEET = "You don't have access to this sheet."

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
  const g = await guard(req, 'sheet-rows', 'GET')
  if (g.deny) return g.deny
  const { searchParams } = new URL(req.url)
  const sheet_id        = searchParams.get('sheet_id')
  const approval_status = searchParams.get('approval_status')

  if (!sheet_id) return NextResponse.json({ ok: false, error: 'sheet_id required' }, { status: 400 })
  if (!canUseSheet(g.user!, sheet_id)) return NextResponse.json({ ok: false, error: NO_SHEET }, { status: 403 })

  const query: Record<string, string> = { sheet_id: `eq.${sheet_id}`, order: 'row_index.asc', limit: '5000' }
  // "pending" also lists rows whose approval was interrupted half-way
  // ('approving' for over 2 minutes) so they can be approved again.
  if (approval_status === 'pending') query['approval_status'] = 'in.(pending,approving)'
  else if (approval_status) query['approval_status'] = `eq.${approval_status}`

  const { data, error } = await dbSelect('order_sheet_rows', query,
    'id,sheet_id,row_index,party,sub_party,sales_person,article,blend,width,gsm,color,' +
    'lab_no,lot_no,challan_no,qty_kg,qty_mtr,no_of_taka,type_of_finish,type_of_packing,' +
    'remarks,hold_reason,order_number,process,delivery_date,current_stage,approval_status,' +
    'rejection_reason,submitted_on,received_at,submit_for_approval,request_edit,' +
    'edit_history,edit_requested_on,is_batch_row,updated_at'
  )
  if (error) return NextResponse.json({ ok: false, error }, { status: 500 })

  // ?order_batches=DYE26-0001 → that order's batches, only if the order belongs to a row of this sheet
  const orderNo = searchParams.get('order_batches')
  if (orderNo) {
    if (!data.some((r: any) => String(r.order_number || '').trim() === orderNo.trim()))
      return NextResponse.json({ ok: false, error: 'This order is not on this sheet.' }, { status: 403 })
    return NextResponse.json({ ok: true, ...(await orderBatches(orderNo.trim())) })
  }

  // batch count per order number, for the Batches column
  const counts: Record<string, number> = {}
  const nos = [...new Set(data.map((r: any) => String(r.order_number || '').trim()).filter(Boolean))]
  if (nos.length) {
    const { data: ords } = await dbSelect('orders', { order_number: `in.(${nos.map(n => `"${n}"`).join(',')})`, limit: '5000' }, 'id,order_number')
    const byId: Record<string, string> = {}
    for (const o of (ords || []) as any[]) byId[o.id] = o.order_number
    const ids = Object.keys(byId)
    if (ids.length) {
      const { data: bs } = await dbSelect('batches', { order_id: `in.(${ids.join(',')})`, limit: '20000' }, 'order_id')
      for (const b of (bs || []) as any[]) { const n = byId[b.order_id]; if (n) counts[n] = (counts[n] || 0) + 1 }
    }
  }
  return NextResponse.json({ ok: true, data: data.map(toClient), batchCounts: counts })
}

// Order + its batches for the sheet's batch panel (read-only view for the party)
async function orderBatches(orderNo: string) {
  const { data: ords } = await dbSelect('orders', { order_number: `eq.${orderNo}`, limit: '1' },
    'id,order_number,article,color,qty_kg,qty_mtr,no_of_taka,status,process_route,delivery_date,supervisors(name)')
  const order = ords?.[0]
  if (!order) return { order: null, batches: [] }
  const { data: bs } = await dbSelect('batches', { order_id: `eq.${order.id}`, order: 'created_at.asc', limit: '500' },
    'id,batch_id,sub_prod_no,reprocessed_to,kg,mtr,taka,status,current_process,last_process,is_done,is_faulty,process_route,planned_date,actual_date,created_at,updated_at,' +
    'machines(name),batch_processes(process_code,status,sent_at,received_at,done_at)')
  return { order, batches: bs || [] }
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

// Office moves (Pending Approvals): reject a request, accept / reject an edit
const OFFICE_MOVES = new Set(['pending>rejected', 'edit-request>edit-accepted', 'edit-request>approved'])

// Order details on a row. Once a row is an order, a party may change them only
// with "Request Edit" ticked (the office then accepts or rejects the change).
const CONTENT_FIELDS = ['party', 'sub_party', 'sales_person', 'article', 'blend', 'width', 'gsm', 'color', 'lab_no',
  'lot_no', 'challan_no', 'qty_kg', 'qty_mtr', 'no_of_taka', 'type_of_finish', 'type_of_packing', 'remarks']
const sameVal = (a: any, b: any) => {
  // empty, null and 0 count as the same (qty columns default to 0)
  const n = (x: any) => (x === null || x === undefined || String(x).trim() === '' ? ''
    : !isNaN(Number(x)) ? (Number(x) === 0 ? '' : String(Number(x))) : String(x).trim())
  return n(a) === n(b)
}

/** A stored original value back in its column's type. */
function dbValue(f: string, v: any) {
  if (v === null || v === undefined || v === '') return null
  if (f === 'qty_kg' || f === 'qty_mtr') { const n = parseFloat(v); return isNaN(n) ? null : n }
  if (f === 'no_of_taka') { const n = parseInt(v); return isNaN(n) ? null : n }
  return String(v)
}

/** Save one row. Existing rows are patched by id; rows without an id are inserted. */
async function saveOne(sheetId: string, row: any, fromSheet: boolean) {
  const dbRow: Record<string, any> = toDB(row, sheetId)
  delete dbRow.sheet_id
  delete dbRow.row_index

  if (row.id) {
    const { data: cur } = await dbSelect('order_sheet_rows', { id: `eq.${row.id}`, limit: '1' }, '*')
    const inDb = cur?.[0]
    if (inDb) {
      if (inDb.sheet_id !== sheetId) return { status: 400, error: 'Row belongs to another sheet' }
      // A row that became an order keeps its order number — nobody can change
      // or clear it from here (orders are only created by "approve_row").
      if (inDb.order_number) dbRow.order_number = inDb.order_number
      else delete dbRow.order_number
      if (inDb.approval_status === 'approving') {
        return { status: 409, error: 'This row is being approved right now. Reload the sheet in a moment.' }
      }
      if (!inDb.order_number && dbRow.approval_status === 'approved') {
        return { status: 409, error: 'Use "Approve" on Pending Approvals to turn a row into an order.' }
      }
      const was = inDb.approval_status || 'draft'
      const now = dbRow.approval_status || 'draft'
      if (fromSheet) {
        for (const f of OFFICE_FIELDS) delete dbRow[f]
        if (was !== now && !SHEET_MOVES.has(`${was}>${now}`)) {
          return { status: 409, error: `This row was updated by the office (now "${was}"). Reload the sheet to see the latest.` }
        }
        if (was === 'rejected' && now === 'pending') dbRow.rejection_reason = null   // resubmitted after fixing
        const isOrder = ['approved', 'edit-accepted', 'edit-request'].includes(was)
        // content may change only after "Request Edit" was saved (or when an
        // edit request is withdrawn and the old values are put back)
        const editing = inDb.request_edit === true || (was === 'edit-request' && now === 'approved')
        if (isOrder && !editing && CONTENT_FIELDS.some(f => !sameVal(dbRow[f], inDb[f]))) {
          return { status: 409, error: 'This row is already an order — tick "Request Edit" before changing it.' }
        }
        // The edit history (original value of each changed cell, which the
        // office sees and "Reject" puts back) is kept by the server — never
        // taken from the browser.
        // A new edit (Request Edit just ticked) starts with an empty history,
        // so old leftovers can never be "restored" over the order's values.
        const startingEdit = isOrder && inDb.request_edit !== true && dbRow.request_edit === true && was !== 'edit-request'
        const hist: Record<string, any> = startingEdit ? {}
          : { ...((inDb.edit_history && typeof inDb.edit_history === 'object') ? inDb.edit_history : {}) }
        const withdrawing = isOrder && ((was === 'edit-request' && now === 'approved')
          || (inDb.request_edit === true && dbRow.request_edit !== true && now === was))
        if (withdrawing) {
          // edit withdrawn / Request Edit unticked → every cell goes back to
          // the order's values (changed cells from the history, the others
          // as they are in the database — nothing taken from the browser)
          CONTENT_FIELDS.forEach((f, i) => {
            const idx = String(i + 2)
            dbRow[f] = idx in hist ? dbValue(f, hist[idx]) : inDb[f]
          })
          dbRow.edit_history = {}
        } else if (isOrder && editing) {
          CONTENT_FIELDS.forEach((f, i) => {
            const idx = String(i + 2)
            if (!(idx in hist) && !sameVal(dbRow[f], inDb[f])) hist[idx] = inDb[f] ?? ''   // first change wins
            if (idx in hist && sameVal(dbRow[f], hist[idx])) delete hist[idx]             // changed back
          })
          dbRow.edit_history = hist
        } else {
          dbRow.edit_history = hist
        }
      } else if (was !== now && !SHEET_MOVES.has(`${was}>${now}`) && !OFFICE_MOVES.has(`${was}>${now}`)) {
        return { status: 409, error: `This row is now "${was}" — it was changed meanwhile. Refresh the page.` }
      }
      // Write only if the row is still as read above (a save racing with an
      // approval or another office user gets 409 instead of undoing it)
      const { data: upd, error } = await sb<any[]>('/order_sheet_rows', {
        method: 'PATCH',
        params: {
          id: `eq.${row.id}`,
          approval_status: inDb.approval_status == null ? 'is.null' : `eq.${inDb.approval_status}`,
          order_number: inDb.order_number ? `eq.${inDb.order_number}` : 'is.null',
        },
        body: JSON.stringify(dbRow),
      })
      if (error) return { status: 500, error }
      if (!Array.isArray(upd) || !upd.length) {
        return { status: 409, error: 'This row was changed meanwhile (by the office or another screen). Reload to see the latest.' }
      }
      return { status: 200, id: row.id }
    }
    // The row was deleted elsewhere — fall through and add it back as a new row
  }
  delete dbRow.order_number   // a new row is never an order yet
  if (dbRow.approval_status === 'approved' || dbRow.approval_status === 'approving') dbRow.approval_status = 'draft'
  if (fromSheet) {
    for (const f of OFFICE_FIELDS) delete dbRow[f]
    // a party's new row starts as a draft or is submitted — nothing else
    if (dbRow.approval_status !== 'pending') { dbRow.approval_status = 'draft'; dbRow.submit_for_approval = false }
  }
  const ins = await insertRow(sheetId, dbRow)
  return ins.error ? { status: 500, error: ins.error } : { status: 200, id: ins.id, row_index: ins.row_index }
}

async function orderExists(orderNumber: string): Promise<boolean> {
  const { data } = await dbSelect('orders', { order_number: `eq.${orderNumber}`, limit: '1' }, 'id')
  return !!data?.length
}

/** Mark an approving row approved with its order number (one retry). */
async function finishRow(id: string, orderNumber: string) {
  const done = { approval_status: 'approved', order_number: orderNumber, submit_for_approval: false,
                 request_edit: false, received_at: new Date().toISOString(), updated_at: new Date().toISOString() }
  let fin = await dbUpdate('order_sheet_rows', { id }, done)
  if (fin.error) fin = await dbUpdate('order_sheet_rows', { id }, done)
  return fin
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const { action } = body
  const g = await guard(req, 'sheet-rows', action)
  if (g.deny) return g.deny
  const user = g.user!
  // Anyone who isn't office (admin, or Edit on Pending Approvals) saves under
  // the party-sheet rules (no office fields, only the allowed status moves).
  // Decided from the user's role in the database, not from the browser.
  const fromSheet = !isSheetOffice(user)
  const noSheet = () => NextResponse.json({ ok: false, error: NO_SHEET }, { status: 403 })

  // ── Save one row (new rows return their id) ───────────────────────────────
  if (action === 'upsert_row') {
    const { sheet_id, row } = body
    if (!sheet_id || !row) return NextResponse.json({ ok: false, error: 'sheet_id and row required' }, { status: 400 })
    if (!canUseSheet(user, sheet_id)) return noSheet()
    const r = await saveOne(sheet_id, row, fromSheet)
    if (r.error) return NextResponse.json({ ok: false, error: r.error }, { status: r.status })
    return NextResponse.json({ ok: true, id: r.id, row_index: (r as any).row_index ?? null })
  }

  // ── Bulk save (one-time copy of a legacy sheet) — in order, one by one ────
  if (action === 'bulk_upsert') {
    const { sheet_id, rows } = body
    if (!sheet_id || !Array.isArray(rows))
      return NextResponse.json({ ok: false, error: 'sheet_id and rows[] required' }, { status: 400 })
    if (!canUseSheet(user, sheet_id)) return noSheet()
    const { data: existing } = await dbSelect('order_sheet_rows', { sheet_id: `eq.${sheet_id}`, limit: '1' }, 'id')
    if (!existing?.length) {
      const { data: sh0 } = await dbSelect('order_sheets', { id: `eq.${sheet_id}`, limit: '1' }, 'id,rows')
      const legacyCount = Array.isArray(sh0?.[0]?.rows) ? sh0[0].rows.length : 0
      if (!legacyCount) return NextResponse.json({ ok: true, upserted: 0 })
      if (fromSheet) {
        return NextResponse.json({ ok: false,
          error: 'This sheet has not been moved to the new format yet — ask the office to open it once.' }, { status: 409 })
      }
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
    if (!canUseSheet(user, sheet_id)) return noSheet()
    const ins = await insertRow(sheet_id, { approval_status: 'draft', updated_at: new Date().toISOString() })
    if (ins.error) return NextResponse.json({ ok: false, error: ins.error }, { status: 500 })
    return NextResponse.json({ ok: true, id: ins.id, row_index: ins.row_index })
  }

  // ── Delete one row ────────────────────────────────────────────────────────
  if (action === 'delete_row') {
    const { id } = body
    if (!id) return NextResponse.json({ ok: false, error: 'id required' }, { status: 400 })
    const { data: cur } = await dbSelect('order_sheet_rows', { id: `eq.${id}`, limit: '1' }, 'id,sheet_id,approval_status,order_number')
    const r = cur?.[0]
    if (!r) return NextResponse.json({ ok: true })   // already gone
    if (!canUseSheet(user, r.sheet_id)) return noSheet()
    // A row that already became an order (or is waiting for approval) can't be
    // deleted from a party sheet — only an admin can remove it.
    const st = r.approval_status || 'draft'
    if ((r.order_number || !['draft', 'rejected'].includes(st)) && !user.isAdmin) {
      return NextResponse.json({ ok: false, error: `This row is "${st}"${r.order_number ? ` (order ${r.order_number})` : ''} — ask the office to remove it.` }, { status: 403 })
    }
    const { error } = await dbDelete('order_sheet_rows', { id })
    if (error) return NextResponse.json({ ok: false, error }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  // ── Approve a row → create its order (office only) ────────────────────────
  // 1. claim the row: pending → 'approving', only if it still has no order
  //    number (a second click / second office user gets 409, never a 2nd order)
  // 2. create the order from the row AS SAVED IN THE DATABASE
  // 3. row → 'approved' with the order number (on failure → back to 'pending')
  if (action === 'approve_row') {
    const { id } = body
    if (!id) return NextResponse.json({ ok: false, error: 'id required' }, { status: 400 })
    const now = new Date()
    const staleBefore = new Date(now.getTime() - 2 * 60_000).toISOString()
    // (plain filters only — PostgREST re-checks an "or=" filter on the
    // returned row, which would hide the row we just claimed)
    const claimWhere = async (extra: Record<string, string>) => sb<any[]>('/order_sheet_rows', {
      method: 'PATCH',
      params: { id: `eq.${id}`, order_number: 'is.null', ...extra },
      body: JSON.stringify({ approval_status: 'approving', updated_at: now.toISOString() }),
    })
    // An approval that broke off half-way over 2 minutes ago: if its order
    // exists, finish the row; if not, put the row back so it can be approved
    {
      const { data: cur0 } = await dbSelect('order_sheet_rows', { id: `eq.${id}`, limit: '1' }, 'approval_status,order_number,updated_at')
      const c0 = cur0?.[0]
      if (c0?.approval_status === 'approving' && c0.order_number && new Date(c0.updated_at).getTime() < now.getTime() - 2 * 60_000) {
        if (await orderExists(c0.order_number)) {
          await finishRow(id, c0.order_number)
          return NextResponse.json({ ok: true, order_number: c0.order_number, recovered: true })
        }
        await sb('/order_sheet_rows', {
          method: 'PATCH', params: { id: `eq.${id}`, approval_status: 'eq.approving', order_number: `eq.${c0.order_number}` },
          body: JSON.stringify({ approval_status: 'pending', order_number: null, updated_at: new Date().toISOString() }),
          headers: { 'Prefer': 'return=minimal' },
        })
      }
    }
    let claim = await claimWhere({ approval_status: 'eq.pending' })
    if (!claim.error && !(Array.isArray(claim.data) && claim.data.length)) {
      // an approval that broke off half-way over 2 minutes ago may be retried
      claim = await claimWhere({ approval_status: 'eq.approving', updated_at: `lt.${staleBefore}` })
    }
    if (claim.error) return NextResponse.json({ ok: false, error: claim.error }, { status: 500 })
    const row = Array.isArray(claim.data) ? claim.data[0] : null
    if (!row) {
      const { data: cur } = await dbSelect('order_sheet_rows', { id: `eq.${id}`, limit: '1' }, 'approval_status,order_number')
      const c = cur?.[0]
      const why = !c ? 'This row no longer exists.'
        : c.approval_status === 'approving' ? 'Someone is approving this row right now.'
        : c.order_number ? `This row is already order ${c.order_number}.`
        : `This row is now "${c.approval_status || 'draft'}" — it is no longer waiting for approval.`
      return NextResponse.json({ ok: false, stale: true, error: `${why} Refresh the page.` }, { status: 409 })
    }
    const release = () => sb('/order_sheet_rows', {
      method: 'PATCH', params: { id: `eq.${id}`, approval_status: 'eq.approving', order_number: 'is.null' },
      body: JSON.stringify({ approval_status: 'pending', updated_at: new Date().toISOString() }),
      headers: { 'Prefer': 'return=minimal' },
    })
    if (!canUseSheet(user, row.sheet_id)) { await release(); return noSheet() }

    // Take the order number and write it on the row FIRST: if anything fails
    // later the row can never be approved into a second order.
    const no = await nextOrderNumber()
    if (no.error || !no.number) { await release(); return NextResponse.json({ ok: false, error: no.error }, { status: 500 }) }
    const tag = await sb<any[]>('/order_sheet_rows', {
      method: 'PATCH', params: { id: `eq.${id}`, approval_status: 'eq.approving', order_number: 'is.null' },
      body: JSON.stringify({ order_number: no.number, updated_at: new Date().toISOString() }),
    })
    if (tag.error || !Array.isArray(tag.data) || !tag.data.length) {
      await release()
      return NextResponse.json({ ok: false, error: tag.error || 'The row changed while approving — try again.' }, { status: tag.error ? 500 : 409 })
    }

    const num = (v: any) => (v === null || v === undefined || v === '' || isNaN(Number(v)) ? 0 : Number(v))
    const { data: order, error } = await createOrder({
      status: 'new', process_route: [],
      party: row.party || '', article: row.article || '', blend: row.blend || '', color: row.color || '',
      challan_no: row.challan_no || '', qty_kg: num(row.qty_kg), qty_mtr: num(row.qty_mtr),
      no_of_taka: Math.round(num(row.no_of_taka)), width: row.width || '', gsm: row.gsm || '',
      lab_no: row.lab_no || '', lot_no: row.lot_no || '', sub_party: row.sub_party || '',
      sales_person: row.sales_person || '', type_of_finish: row.type_of_finish || '',
      type_of_packing: row.type_of_packing || '', delivery_date: row.delivery_date || null,
      remarks: row.remarks || '',
    }, 'Sheet approval', { orderNumber: no.number })
    if ((error || !order?.order_number) && await orderExists(no.number)) {
      // the order was saved even though the answer got lost — carry on
    } else if (error || !order?.order_number) {
      // no order was made → take the number off again and put the row back
      await sb('/order_sheet_rows', {
        method: 'PATCH', params: { id: `eq.${id}`, approval_status: 'eq.approving', order_number: `eq.${no.number}` },
        body: JSON.stringify({ approval_status: 'pending', order_number: null, updated_at: new Date().toISOString() }),
        headers: { 'Prefer': 'return=minimal' },
      })
      return NextResponse.json({ ok: false, error: error || 'Order was not created' }, { status: 500 })
    }
    const fin = await finishRow(id, no.number)
    if (fin.error) {
      return NextResponse.json({ ok: false,
        error: `Order ${no.number} was created, but the sheet row still shows "approving" (${fin.error}). Click Approve again in a few minutes to finish it — no second order is made.` }, { status: 500 })
    }
    await auditLog({ action: 'sheet_approve', entity_type: 'order_sheet_row', entity_id: id,
      new_value: no.number })
    return NextResponse.json({ ok: true, order_number: no.number })
  }

  return NextResponse.json({ ok: false, error: 'Unknown action' }, { status: 400 })
}
