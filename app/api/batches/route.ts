import { NextRequest, NextResponse } from 'next/server'
import { dbSelect, dbInsert, dbUpdate, dbDelete, sb, auditLog } from '@/lib/supabase'
import { requireAdmin } from '@/lib/auth'
import { canonicalCode } from '@/lib/processCodes'
import { guard, pick, canWorkProcess } from '@/lib/access'
import { rpc, rpcFail } from '@/lib/rpc'
import { loadHolidaySet } from '@/lib/holidays'
import { plannedDateForNumber } from '@/lib/workdays'
import { todayIST } from '@/lib/istDate'
import { machineLoading, rangeBatches, reelSpeedNeeded, cycleNeeded, maxCycleOf, loadingSettingsFrom, nozzleFor, NozzleRow } from '@/lib/loading'

// Columns the generic "update" action may change (machine sheet numbering,
// Date Calculator, supervisor pages). Where a batch IS (process / status /
// done / faulty) is never set here — only by the batch-move actions below
// (send_first, process_done, mark_faulty, rollback …), which check the batch
// in the database first. Anything else the browser sends is dropped.
const BATCH_UPDATE_FIELDS = [
  'date_calc_plan', 'dc_generated_once', 'dc_regenerate', 'supervisor_id', 'machine_id',
  'process_machine_map', 'notes', 'planned_date', 'actual_date', 'fms_actual_dates',
] as const
// Most kg a split may go over the order qty (rounding)
const SPLIT_TOLERANCE_KG = 0.5
import { deriveMachineMap, primaryMachine } from '@/lib/machineMap'
import { refreshOrderStatus, refreshOrderStatusForBatch } from '@/lib/orderStatus'

function noProcess(code: string) {
  return NextResponse.json({ ok: false,
    error: `You don't have Edit permission on FMS — ${code}. Ask an admin to give it to you in User Management.` }, { status: 403 })
}

// GET /api/batches
export async function GET(req: NextRequest) {
  const g = await guard(req, 'batches', 'GET')
  if (g.deny) return g.deny
  try {
    const { searchParams } = new URL(req.url)
    const uuid_id    = searchParams.get('id')
    const order_id   = searchParams.get('order_id')
    const machine_id = searchParams.get('machine_id')
    const batch_id   = searchParams.get('batch_id')
    const status     = searchParams.get('status')
    const limit      = searchParams.get('limit')   // none = all batches

    const query: Record<string, string> = { order: 'batch_number.asc,id.asc' }
    if (limit) query.limit = limit
    if (uuid_id)    query['id']         = `eq.${uuid_id}`
    if (order_id)   query['order_id']   = `eq.${order_id}`
    if (machine_id) query['machine_id'] = `eq.${machine_id}`
    if (batch_id)   query['batch_id']   = `eq.${batch_id}`
    if (status)     query['status']     = `eq.${status}`
    // active=1 → only batches still to finish (AI context, dashboards)
    else if (searchParams.get('active') === '1') query['status'] = 'not.in.(done,written-off)'

    // fields=light → just what counts / badges need (no nested process rows)
    if (searchParams.get('fields') === 'light') {
      const { data, error } = await dbSelect('batches', query,
        'id,batch_id,order_id,machine_id,supervisor_id,kg,status,current_process,is_done,is_faulty')
      if (error) return NextResponse.json({ ok: false, error }, { status: 500 })
      return NextResponse.json({ ok: true, data })
    }

    const { data, error } = await dbSelect('batches', query,
      'id,batch_id,order_id,machine_id,batch_number,kg,mtr,taka,status,current_process,last_process,process_params,' +
      'is_done,is_faulty,planned_date,actual_date,notes,process_route,' +
      'date_calc_plan,dc_generated_once,dc_regenerate,process_machine_map,supervisor_id,' +
      'fms_enter_at,fms_actual_dates,sent_at,' +
      'created_at,updated_at,' +
      'machines(id,name,capacity),' +
      'batch_processes(id,process_code,status,sent_at,received_at,done_at)'
    )
    if (error) {
      console.error('[/api/batches GET] Supabase error:', error)
      return NextResponse.json({ ok: false, error }, { status: 500 })
    }
    return NextResponse.json({ ok: true, data })
  } catch (err: any) {
    console.error('[/api/batches GET] Unexpected error:', err)
    return NextResponse.json({ ok: false, error: err.message || 'Server error' }, { status: 500 })
  }
}

// ── Split helpers ────────────────────────────────────────────────────────────
// Splitting is ADDITIVE: existing batches of an order are never deleted here.
// Batch IDs are generated on the server so they always continue from the
// highest number the order already has (B1, B2 … even after deletes).
// only plain numbers / short texts from the Auto Split preview are kept
function cleanParams(p: any): Record<string, any> | null {
  if (!p || typeof p !== 'object' || Array.isArray(p)) return null
  const out: Record<string, any> = {}
  for (const k of ['machine', 'nozzle', 'pumpRpm', 'cycle', 'pressure', 'width', 'gsm', 'mtrPerKg', 'hotLength', 'stdLoad', 'minPerBatch', 'maxPerBatch', 'reelNeeded', 'cycleNeeded']) {
    const v = p[k]
    if (typeof v === 'number' && isFinite(v)) out[k] = v
    else if (typeof v === 'string' && v.length <= 60) out[k] = v
  }
  return Object.keys(out).length ? out : null
}

async function getSplitContext(order_id: string) {
  const { data: orderRows, error: orderErr } = await dbSelect('orders',
    { id: `eq.${order_id}`, limit: '1' }, 'id,order_number,status,qty_kg,qty_mtr,no_of_taka,process_machines,process_route')
  const order = orderRows?.[0]
  if (orderErr || !order) {
    return { order: null, nextNo: 0, allocatedKg: 0, allocatedMtr: 0, allocatedTaka: 0, error: orderErr || 'Order not found' }
  }
  if (!order.order_number) {
    return { order, nextNo: 0, allocatedKg: 0, allocatedMtr: 0, allocatedTaka: 0, error: 'This order has no order number — set one before splitting.' }
  }

  const { data: existing } = await dbSelect('batches',
    { order_id: `eq.${order_id}` }, 'id,batch_id,batch_number,kg,mtr,taka')
  let maxNo = 0
  let allocatedKg = 0, allocatedMtr = 0, allocatedTaka = 0
  for (const b of existing || []) {
    allocatedKg += parseFloat(b.kg) || 0
    allocatedMtr += parseFloat(b.mtr) || 0
    allocatedTaka += parseInt(b.taka) || 0
    if (b.batch_number) maxNo = Math.max(maxNo, Number(b.batch_number) || 0)
    // Only plain "-B<n>" ids count here (repair ids like -B2-R / -B2-R-S1 don't)
    const m = String(b.batch_id || '').match(/-B(\d+)$/)
    if (m) maxNo = Math.max(maxNo, parseInt(m[1], 10))
  }
  return { order, nextNo: maxNo + 1, allocatedKg, allocatedMtr, allocatedTaka, error: null as string | null }
}

async function insertBatchProcesses(created: any[] | null | undefined, process_route: string[] | undefined) {
  if (!created?.length || !process_route?.length) return
  const bpRows: any[] = []
  for (const batch of created) {
    for (const code of process_route) {
      bpRows.push({ batch_id: batch.id, process_code: code, status: 'pending' })
    }
  }
  await sb('/batch_processes?on_conflict=batch_id,process_code', {
    method: 'POST', body: JSON.stringify(bpRows),
    headers: { 'Prefer': 'resolution=merge-duplicates,return=minimal' },
  })
}

// POST /api/batches
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { action, _user: _ignored, ...payload } = body
    const _user = undefined            // the audit log uses the signed-in user
    const g = await guard(req, 'batches', action)
    if (g.deny) return g.deny
    // One standard spelling for process codes (e.g. 'ADD' → 'Add', 'QA' → 'Qa')
    if (payload.process_code) payload.process_code = canonicalCode(payload.process_code)
    if (payload.next_process) payload.next_process = canonicalCode(payload.next_process)

    // ── Split: ADD new batches to an order (never deletes existing ones) ─────
    // ── Auto Split preview (the Machine calculation sheet) ──────────────────
    // Sizes the batches for the order's Dyeing machine (or its SCQ / first
    // machine process when there is no dyeing): the fewest equal batches that
    // each fall between machine size × 60 % and × 80 % (Factory Settings), or
    // the split closest to that range (lib/loading.ts). Nothing is saved —
    // the page shows the preview and saves with create_splits.
    if (action === 'auto_split_preview') {
      const { order_id } = payload
      if (!order_id) return NextResponse.json({ ok: false, error: 'order_id required' }, { status: 400 })
      const ctx = await getSplitContext(order_id)
      if (ctx.error || !ctx.order) return NextResponse.json({ ok: false, error: ctx.error }, { status: 400 })
      const { data: oRows } = await dbSelect('orders', { id: `eq.${order_id}`, limit: '1' }, 'width,gsm')
      const width = oRows?.[0]?.width, gsm = oRows?.[0]?.gsm
      const route: string[] = (ctx.order.process_route || []).map((c: string) => canonicalCode(c))
      const pm: Record<string, string[]> = {}
      for (const [k, v] of Object.entries(ctx.order.process_machines || {})) pm[canonicalCode(k)] = (Array.isArray(v) ? v : [v]).filter(Boolean) as string[]
      const SIZING_ORDER = ['D', 'S', 'S2', 'Add', 'Lev', 'Fix', 'Wash', 'Rc']
      const code = SIZING_ORDER.find(c => route.includes(c) && pm[c]?.length)
      if (!code) {
        return NextResponse.json({ ok: false, error: `${ctx.order.order_number}: no Dyeing / SCQ machine is set — confirm the route with machines on the Supervisor page first.` }, { status: 400 })
      }
      const options = pm[code]
      const machineId = payload.machine_id && options.includes(payload.machine_id) ? payload.machine_id : options[0]
      const { data: mRows } = await dbSelect('machines', { id: `in.(${options.join(',')})` }, 'id,name,capacity,nozzles,reel_speed')
      const machine = (mRows || []).find((m: any) => m.id === machineId)
      if (!machine) return NextResponse.json({ ok: false, error: 'The machine set on this order was not found' }, { status: 400 })
      const { data: setRows } = await dbSelect('settings', { key: 'in.(factory,nozzleTable)' }, 'key,value')
      const factory = (setRows || []).find((r: any) => r.key === 'factory')?.value || {}
      const table = (setRows || []).find((r: any) => r.key === 'nozzleTable')?.value
      const settings = loadingSettingsFrom(factory)
      const calc = machineLoading(width, gsm, machine, settings)
      if (!calc.ok) return NextResponse.json({ ok: false, error: calc.error }, { status: 400 })
      const nozzle = Array.isArray(table) ? nozzleFor(calc.gsm!, table as NozzleRow[]) : calc.nozzle

      const qtyKg = parseFloat(ctx.order.qty_kg) || 0
      const remKg = Math.max(0, Math.round((qtyKg - ctx.allocatedKg) * 100) / 100)
      if (remKg < 0.5) return NextResponse.json({ ok: false, error: `${ctx.order.order_number} is already fully split.` }, { status: 400 })
      const remMtr = Math.max(0, (parseFloat(ctx.order.qty_mtr) || 0) - ctx.allocatedMtr)
      const remTaka = Math.max(0, (parseInt(ctx.order.no_of_taka) || 0) - ctx.allocatedTaka)
      const kgs = rangeBatches(remKg, calc.minPerBatch, calc.maxPerBatch!)
      const nz = parseFloat(machine.nozzles) || 0, reel = parseFloat(machine.reel_speed) || 0
      let mtrLeft = remMtr, takaLeft = remTaka
      const batches = kgs.map((kg, i) => {
        const last = i === kgs.length - 1
        const share = remKg > 0 ? kg / remKg : 0
        const mtr = last ? Math.round(mtrLeft * 10) / 10 : Math.round(remMtr * share * 10) / 10
        const taka = last ? takaLeft : Math.floor(remTaka * share)
        mtrLeft -= mtr; takaLeft -= taka
        return { kg, mtr: mtr || null, taka: taka || null,
          reelNeeded: reelSpeedNeeded(kg, calc.hotLength!, nz, settings),
          cycleNeeded: cycleNeeded(kg, calc.hotLength!, nz, reel) }
      })
      const r2 = (x: number | null | undefined, d = 2) => x == null ? null : Math.round(x * 10 ** d) / 10 ** d
      return NextResponse.json({ ok: true,
        order: { id: order_id, order_number: ctx.order.order_number, qty_kg: qtyKg, allocated_kg: r2(ctx.allocatedKg), remaining_kg: remKg, width, gsm },
        process: code,
        machines: (mRows || []).map((m: any) => ({ id: m.id, name: m.name })).sort((a: any, b: any) => options.indexOf(a.id) - options.indexOf(b.id)),
        machine: { id: machine.id, name: machine.name, capacity: parseFloat(machine.capacity) || null, nozzles: parseFloat(machine.nozzles) || null, reel_speed: parseFloat(machine.reel_speed) || null },
        settings,
        calc: { width: calc.width, gsm: calc.gsm, mtrPerKg: r2(calc.mtrPerKg, 3), hotLength: r2(calc.hotLength, 3),
                stdLoad: r2(calc.stdLoad, 1), sizeMin: r2(calc.sizeMin, 1), sizeLimit: r2(calc.sizeLimit, 1),
                minPerBatch: r2(calc.minPerBatch, 1), maxPerBatch: r2(calc.maxPerBatch, 1), maxCycle: maxCycleOf(nozzle), basis: calc.basis, note: calc.note || null },
        params: nozzle ? { nozzle: nozzle.nozzle, pumpRpm: nozzle.pumpRpm, cycle: nozzle.cycle, pressure: nozzle.pressure } : null,
        batches })
    }

    if (action === 'create_splits') {
      const { order_id, batches, process_route } = payload
      if (!order_id || !batches?.length) {
        return NextResponse.json({ ok: false, error: 'order_id and batches required' }, { status: 400 })
      }

      const ctx = await getSplitContext(order_id)
      if (ctx.error || !ctx.order) return NextResponse.json({ ok: false, error: ctx.error }, { status: 400 })

      const parts = batches.filter((b: any) => (parseFloat(b.kg) || 0) > 0)
      if (!parts.length) {
        return NextResponse.json({ ok: false, error: 'Every batch needs a quantity above 0 Kg' }, { status: 400 })
      }
      if (ctx.order.status === 'hold') {
        return NextResponse.json({ ok: false, error: `${ctx.order.order_number} is on hold — release the hold before splitting.` }, { status: 409 })
      }
      const newKg = parts.reduce((t: number, b: any) => t + (parseFloat(b.kg) || 0), 0)
      const orderKg = parseFloat(ctx.order.qty_kg) || 0
      if (orderKg > 0 && ctx.allocatedKg + newKg > orderKg + SPLIT_TOLERANCE_KG) {
        return NextResponse.json({ ok: false, error:
          `Too much: ${Math.round(ctx.allocatedKg)} Kg is already split and these batches add ${Math.round(newKg * 100) / 100} Kg, ` +
          `but the order is ${orderKg} Kg (${Math.max(0, Math.round((orderKg - ctx.allocatedKg) * 100) / 100)} Kg left).` }, { status: 400 })
      }

      // Client-sent batch_id is ignored — the server numbers new batches
      // after the highest existing one so IDs never collide or restart.
      // the order's route when the page didn't send one (an empty list counts as none)
      const route: string[] = ((process_route?.length ? process_route : ctx.order.process_route) || []).map((c: string) => canonicalCode(c))
      const rows = parts.map((b: any, idx: number) => {
        // Which machine runs each process of this batch (lib/machineMap.ts)
        const map = deriveMachineMap(route, ctx.order.process_machines, b.machine_id || null, b.process_machine_map)
        return {
        batch_id:      `${ctx.order.order_number}-B${ctx.nextNo + idx}`,
        order_id,
        machine_id:    b.machine_id || primaryMachine(route, map) || null,
        process_machine_map: map,
        batch_number:  ctx.nextNo + idx,
        kg:            parseFloat(b.kg) || 0,
        mtr:           parseFloat(b.mtr)  || null,
        taka:          parseInt(b.taka)   || null,
        status:        'pending',
        process_route: route,  // save route on batch so machine page shows correct process
        // Auto Split: the machine settings for this batch (nozzle / pump / pressure …)
        process_params: cleanParams(b.process_params),
      }})

      const { data: created, error } = await sb<any[]>('/batches', {
        method: 'POST', body: JSON.stringify(rows),
        headers: { 'Prefer': 'return=representation' },
      })
      if (error) return NextResponse.json({ ok: false, error }, { status: 500 })

      await insertBatchProcesses(created, route)

      await auditLog({ username: _user, action: 'split', entity_type: 'order',
        entity_id: order_id,
        new_value: `${rows.length} batch(es) added: ${rows.map((r: any) => r.batch_id).join(', ')}` })

      await refreshOrderStatus(order_id)   // keep orders.status in step (lib/orderStatus.ts)
      return NextResponse.json({ ok: true, data: created })
    }

    if (action === 'update') {
      const { id } = payload
      if (!id) return NextResponse.json({ ok: false, error: 'id required' }, { status: 400 })
      const patch: Record<string, any> = pick(payload, BATCH_UPDATE_FIELDS)
      if (!Object.keys(patch).length) return NextResponse.json({ ok: false, error: 'Nothing to update' }, { status: 400 })
      const { error } = await dbUpdate('batches', { id }, { ...patch, updated_at: new Date().toISOString() })
      if (error) return NextResponse.json({ ok: false, error }, { status: 500 })
      return NextResponse.json({ ok: true })
    }

    // ── Machine sheet plan numbers ─────────────────────────────────────────
    //   set : [{batch, code, num}]        — type / clear numbers (num null = clear)
    //   auto: {members:[{batch,code}], groups:[[{batch,code}], …]}
    //         — next free numbers on this machine (one per group), handed out
    //           while the machine is locked, so two people can't get the same
    // Each number's planned date is worked out here (3 per working day from
    // the machine's base date, holidays + Sunday rule) and merged into the
    // batch's plan inside the database.
    if (action === 'plan_numbers') {
      const { machine_id } = payload
      if (!machine_id) return NextResponse.json({ ok: false, error: 'machine_id required' }, { status: 400 })
      const { data: mRows } = await dbSelect('machines', { id: `eq.${machine_id}`, limit: '1' }, 'id,name,numbering_base_date')
      const machine = mRows?.[0]
      if (!machine) return NextResponse.json({ ok: false, error: 'Machine not found' }, { status: 404 })
      const clean = (list: any[]) => (Array.isArray(list) ? list : [])
        .filter((x: any) => x && x.batch && x.code).map((x: any) => ({ batch: String(x.batch), code: String(x.code) }))

      let items: { batch: string; code: string; num: number | null; keep?: boolean }[] = []
      if (payload.auto) {
        const groups = (Array.isArray(payload.auto.groups) ? payload.auto.groups : []).map(clean).filter((g: any[]) => g.length)
        if (!groups.length) return NextResponse.json({ ok: true, items: [], plans: {} })
        const r = await rpc<any[]>('df_plan_auto', { p_machine: machine.id, p_members: clean(payload.auto.members), p_groups: groups })
        if (r.error) return rpcFail(r)
        // keep: the date is added only if nobody renumbered it in the meantime
        items = (r.data || []).map((x: any) => ({ batch: x.batch, code: x.code, num: Number(x.num), keep: true }))
      } else {
        items = (Array.isArray(payload.set) ? payload.set : []).filter((x: any) => x && x.batch && x.code).map((x: any) => {
          const n = parseInt(x.num, 10)
          return { batch: String(x.batch), code: String(x.code), num: n > 0 ? n : null }
        })
      }
      if (!items.length) return NextResponse.json({ ok: true, items: [], plans: {} })

      const holidaySet = await loadHolidaySet(machine.id)
      const baseYMD = machine.numbering_base_date ? String(machine.numbering_base_date).slice(0, 10) : todayIST()
      const withDates = items.map(i => ({ ...i, date: i.num ? plannedDateForNumber(i.num, baseYMD, holidaySet) : null }))
      const r2 = await rpc<Record<string, any>>('df_plan_set_many', { p_items: withDates })
      if (r2.error) return rpcFail(r2)
      return NextResponse.json({ ok: true, items: withDates, plans: r2.data || {} })
    }

    // ── Date Calculator "Clear selected": wipe its keys, keep the machine
    // plan numbers — one database step (df_clear_dc_plan)
    if (action === 'clear_dc_plan') {
      const { id } = payload
      if (!id) return NextResponse.json({ ok: false, error: 'id required' }, { status: 400 })
      const r = await rpc<any>('df_clear_dc_plan', { p_batch: id })
      if (r.error) return rpcFail(r)
      return NextResponse.json({ ok: true })
    }

    // ── Send a waiting batch to the first process of its own route ─────────
    // (First Process page) — refused if it was already sent (df_send_first)
    if (action === 'send_first') {
      const { id } = payload
      if (!id) return NextResponse.json({ ok: false, error: 'id required' }, { status: 400 })
      const r = await rpc<any>('df_send_first', { p_batch: id })
      if (r.error) return rpcFail(r)
      await refreshOrderStatus(r.data?.order_id)
      return NextResponse.json({ ok: true, first_process: r.data?.first_process ?? null })
    }

    // ── FMS rollback: one step back on the batch's own route (df_rollback) ─
    // Only while the batch is running at that process with no open FOB.
    if (action === 'rollback') {
      const { batch_id, process_code } = payload
      if (!batch_id || !process_code) {
        return NextResponse.json({ ok: false, error: 'batch_id and process_code required' }, { status: 400 })
      }
      if (!canWorkProcess(g.user!, process_code)) return noProcess(process_code)
      const r = await rpc<any>('df_rollback', { p_batch: batch_id, p_code: process_code })
      if (r.error) return rpcFail(r)
      await refreshOrderStatus(r.data?.order_id)
      return NextResponse.json({ ok: true, prev_process: r.data?.prev_process ?? null })
    }

    // ── Process Done — one all-or-nothing database step (df_process_done):
    // refuses if the batch is no longer at this process (stale page / double
    // click) or has an open FOB; the next process comes from the batch's own
    // route in the database, never from the browser.
    if (action === 'process_done') {
      const { batch_id, process_code } = payload
      if (!batch_id || !process_code) {
        return NextResponse.json({ ok: false, error: 'batch_id and process_code required' }, { status: 400 })
      }
      if (!canWorkProcess(g.user!, process_code)) return noProcess(process_code)
      const r = await rpc<any>('df_process_done', { p_batch: batch_id, p_code: process_code })
      if (r.error) return rpcFail(r)
      await refreshOrderStatus(r.data?.order_id)   // keep orders.status in step (lib/orderStatus.ts)
      return NextResponse.json({ ok: true, next_process: r.data?.next_process ?? null })
    }

    // ── Mark Faulty — one all-or-nothing database step (df_mark_faulty)
    if (action === 'mark_faulty') {
      const { batch_id, faulty_type, faulty_kg, process_code } = payload
      if (!batch_id || !process_code) {
        return NextResponse.json({ ok: false, error: 'batch_id and process_code required' }, { status: 400 })
      }
      if (!canWorkProcess(g.user!, process_code)) return noProcess(process_code)
      const r = await rpc<any>('df_mark_faulty', {
        p_batch: batch_id, p_code: process_code, p_type: faulty_type || null,
        p_kg: faulty_kg !== undefined && faulty_kg !== '' && faulty_kg !== null ? Number(faulty_kg) : null,
      })
      if (r.error) return rpcFail(r)
      await refreshOrderStatus(r.data?.order_id)
      return NextResponse.json({ ok: true, data: { id: r.data?.id } })
    }

    // ── Delete one batch and restore qty to order ────────────────────────────
    if (action === 'delete_batch') {
      // admin only (POLICY) — one database step (df_delete_batch): only a batch
      // that is still waiting (pending, never sent) with no faulty / FOB /
      // repair records; the order goes back to 'splitting' if it was the last
      const { id } = payload
      if (!id) return NextResponse.json({ ok: false, error: 'id required' }, { status: 400 })
      const r = await rpc<any>('df_delete_batch', { p_batch: id })
      if (r.error) return rpcFail(r)
      return NextResponse.json({ ok: true, restored_kg: r.data?.kg ?? null })
    }

    // ── Full split: everything still unsplit becomes ONE new batch ──────────
    // No batches yet  → one batch with the full order qty (B1).
    // Some batches    → one batch with the remaining qty (B<next>), with
    //                   mtr/taka in proportion. Existing batches are untouched.
    if (action === 'full_split') {
      const { order_id, machine_id, process_route } = payload
      if (!order_id) return NextResponse.json({ ok: false, error: 'order_id required' }, { status: 400 })

      const ctx = await getSplitContext(order_id)
      if (ctx.error || !ctx.order) return NextResponse.json({ ok: false, error: ctx.error }, { status: 400 })
      if (ctx.order.status === 'hold') {
        return NextResponse.json({ ok: false, error: `${ctx.order.order_number} is on hold — release the hold before splitting.` }, { status: 409 })
      }

      const totalKg   = parseFloat(ctx.order.qty_kg)     || 0
      const totalMtr  = parseFloat(ctx.order.qty_mtr)    || 0
      const totalTaka = parseInt(ctx.order.no_of_taka)   || 0
      const remainKg  = Math.round((totalKg - ctx.allocatedKg) * 100) / 100
      if (remainKg < 0.5) {
        return NextResponse.json({ ok: false, error: 'Order is already fully split — nothing left to split.' }, { status: 400 })
      }
      const ratio = totalKg > 0 ? remainKg / totalKg : 1
      const isFirst = ctx.allocatedKg <= 0

      const fsRoute: string[] = ((process_route?.length ? process_route : ctx.order.process_route) || []).map((c: string) => canonicalCode(c))
      const fsMap = deriveMachineMap(fsRoute, ctx.order.process_machines, machine_id || null)
      const batch = {
        batch_id:     `${ctx.order.order_number}-B${ctx.nextNo}`,
        order_id,
        machine_id:   machine_id || primaryMachine(fsRoute, fsMap) || null,
        process_machine_map: fsMap,
        batch_number: ctx.nextNo,
        kg:           remainKg,
        // the remainder: what's left of the order's metres / taka after the
        // batches already split (to 0.1 m, like repairs), so they add up exactly
        mtr:          totalMtr  ? (isFirst ? totalMtr  : Math.max(0, Math.round((ctx.allocatedMtr > 0 ? totalMtr - ctx.allocatedMtr : totalMtr * ratio) * 10) / 10)) : null,
        taka:         totalTaka ? (isFirst ? totalTaka : Math.max(0, ctx.allocatedTaka > 0 ? totalTaka - ctx.allocatedTaka : Math.round(totalTaka * ratio))) : null,
        status:       'pending',
        process_route: fsRoute,
      }

      const { data: created, error } = await sb<any[]>('/batches', {
        method: 'POST', body: JSON.stringify([batch]),
        headers: { 'Prefer': 'return=representation' },
      })
      if (error) return NextResponse.json({ ok: false, error }, { status: 500 })

      await insertBatchProcesses(created, fsRoute)

      await auditLog({ username: _user, action: 'full_split', entity_type: 'order',
        entity_id: order_id, new_value: `${batch.batch_id} · ${remainKg}kg` })

      await refreshOrderStatus(order_id)   // keep orders.status in step (lib/orderStatus.ts)
      return NextResponse.json({ ok: true, data: created })
    }

    // ── Reset a process step so batch can be marked done again ─────────────
    if (action === 'reset_process') {
      const { batch_id, process_code } = payload
      if (!batch_id || !process_code) {
        return NextResponse.json({ ok: false, error: 'batch_id and process_code required' }, { status: 400 })
      }
      // Use Supabase RPC for reliable composite key update
      const { error } = await sb('/rpc/reset_batch_process', {
        method: 'POST',
        body: JSON.stringify({ p_batch_id: batch_id, p_process_code: process_code }),
      })
      if (error) return NextResponse.json({ ok: false, error }, { status: 500 })
      await refreshOrderStatusForBatch(batch_id)   // keep orders.status in step (lib/orderStatus.ts)
      return NextResponse.json({ ok: true })
    }

    // ── Create single batch (for repair splits) ──────────────────────────────
    if (action === 'create') {
      const { batch_id, order_id, kg, mtr, taka, machine_id, process_route, status } = payload
      if (!order_id) return NextResponse.json({ ok: false, error: 'order_id required' }, { status: 400 })
      const { data, error } = await dbInsert('batches', {
        batch_id:      batch_id   || null,
        order_id:      order_id,
        kg:            kg         || 0,
        mtr:           mtr        || 0,
        taka:          taka       || 0,
        machine_id:    machine_id || null,
        process_route: process_route || [],
        status:        status     || 'pending',
        is_faulty:     false,
        is_done:       false,
      })
      if (error) return NextResponse.json({ ok: false, error }, { status: 500 })
      await refreshOrderStatus(order_id)   // keep orders.status in step (lib/orderStatus.ts)
      return NextResponse.json({ ok: true, data })
    }

    return NextResponse.json({ ok: false, error: 'Unknown action' }, { status: 400 })
  } catch (err: any) {
    console.error('[/api/batches POST] Unexpected error:', err)
    return NextResponse.json({ ok: false, error: err.message || 'Server error' }, { status: 500 })
  }
}
