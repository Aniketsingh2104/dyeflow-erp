/**
 * /api/snapshot — Denormalized factory snapshot for Report Agent queries.
 * Returns orders (with splits inline), fobRecords, faultyRecords, machines,
 * supervisors, and processList in the same shape that QUERY_LIBRARY expects.
 */
import { NextResponse } from 'next/server'
import { dbSelect } from '@/lib/supabase'
import { DATE_COL } from '@/lib/processCodes'

export async function GET() {
  try {
    // Fetch all tables in parallel
    const [oRes, bRes, mRes, sRes, fobRes, faultyRes, pRes, dpRes] = await Promise.all([
      dbSelect('orders', { order: 'created_at.desc', limit: '2000' },
        'id,order_number,party,article,color,qty_kg,status,supervisor_id,machine_id,process_route,planned_dates,hold_reason,created_at,supervisors(name),machines(name,capacity)'),
      dbSelect('batches', { order: 'created_at.asc', limit: '10000' },
        'id,batch_id,order_id,kg,status,current_process,process_route,fms_enter_at,fms_actual_dates,is_faulty,updated_at,machines(name)'),
      dbSelect('machines', { order: 'name.asc' }, 'id,name,capacity,status,machine_type'),
      dbSelect('supervisors', { order: 'name.asc' }, 'id,name'),
      dbSelect('fob_records', { order: 'created_at.desc', limit: '500' }),
      dbSelect('faulty_records', { order: 'created_at.desc', limit: '500' }),
      dbSelect('process_list', { order: 'display_order.asc', limit: '100' },
        'id,code,name,is_enabled,display_order,default_days'),
      dbSelect('batch_date_plans', {}, '*'),
    ])

    const orders  = (oRes.data  || []) as any[]
    const batches = (bRes.data  || []) as any[]
    const machines    = (mRes.data || []) as any[]
    const supervisors = (sRes.data || []) as any[]
    const fobRecords    = (fobRes.data    || []) as any[]
    const faultyRecords = (faultyRes.data || []) as any[]
    const processList   = (pRes.data || []) as any[]

    // FOB / faulty rows in the field names the Report Agent queries use.
    // The raw status is kept (lib/recordStatus.ts explains each value).
    const common = (r: any) => {
      const b = batchById[r.batch_id] || {}
      const o = orderById[r.order_id || b.order_id] || {}
      return {
        id: r.id, status: r.status,
        batchId:     b.batch_id || '-',
        orderNo:     r.order_number || o.order_number || '-',
        party:       r.party || o.party || '-',
        article:     o.article || '-',
        color:       r.color || o.color || '-',
        processCode: r.process_code || '',
        processName: procName[r.process_code] || r.process_code || '',
        createdAt:   r.created_at,
        reason:      r.notes || '',
        remarks:     r.notes || '',
      }
    }
    const shapeFob = (r: any) => ({
      ...common(r),
      type:           r.fob_type || '',
      qtyKg:          r.fob_kg,
      fobSent:        !!r.sent_at || ['sent', 'approved'].includes(r.status),
      fobSentAt:      r.sent_at || '',
      fobApproved:    r.status === 'approved',
      fobApprovedAt:  r.approved_at || '',
      fobReprocess:   r.status === 'repairing',
      fobReprocessAt: r.status === 'repairing' ? (r.updated_at || r.created_at) : '',
    })
    const shapeFaulty = (r: any) => ({
      ...common(r),
      faultyType: r.faulty_type || '',
      quantity:   r.faulty_kg,
      date:       r.created_at,
      ifOk:       r.if_ok === true || r.status === 'resolved',
      reprocess:  r.status === 'repairing',
      resolvedAt: r.resolved_at || '',
    })

    const orderById: Record<string, any> = {}
    for (const o of orders) orderById[o.id] = o
    const batchById: Record<string, any> = {}
    for (const b of batches) batchById[b.id] = b
    const procName: Record<string, string> = {}
    for (const p of processList) procName[p.code] = p.name

    // Planned dates per order, from the Date Calculator (batch_date_plans):
    // for every process the LATEST date among the order's batches, and
    // 'Dispatch' = latest planned dispatch. Queries read o.plannedDates[code].
    const plannedByOrder: Record<string, Record<string, string>> = {}
    for (const dp of (dpRes.data || []) as any[]) {
      const b = batchById[dp.batch_id]
      if (!b) continue
      const pd = (plannedByOrder[b.order_id] ||= {})
      for (const [code, col] of Object.entries(DATE_COL)) {
        const v = dp[col] ? String(dp[col]).slice(0, 10) : ''
        if (v && (!pd[code] || v > pd[code])) pd[code] = v
      }
      if (!pd.Dispatch && pd.FinalDispatch) pd.Dispatch = pd.FinalDispatch
    }

    // Build batch lookup by order_id
    const batchesByOrder: Record<string, any[]> = {}
    for (const b of batches) {
      if (!batchesByOrder[b.order_id]) batchesByOrder[b.order_id] = []
      batchesByOrder[b.order_id].push({
        batchId:           b.batch_id,
        kg:                b.kg,
        status:            b.status,
        fmsCurrentProcess: b.current_process,
        fmsDone:           b.status === 'done',
        fmsEnterAt:        b.fms_enter_at || {},
        fmsActualDates:    b.fms_actual_dates || {},
        isFaulty:          b.is_faulty,
        machine:           b.machines?.name,
        updatedAt:         b.updated_at,
      })
    }

    // Shape orders to match localStorage schema expected by QUERY_LIBRARY
    const shapedOrders = orders.map(o => ({
      id:           o.id,
      orderNumber:  o.order_number,
      party:        o.party,
      article:      o.article,
      color:        o.color,
      qtyKg:        o.qty_kg,
      status:       o.status,
      supervisor:   o.supervisors?.name || '',
      machine:      o.machines?.name || '',
      processRoute: o.process_route || [],
      plannedDates: { ...(o.planned_dates || {}), ...(plannedByOrder[o.id] || {}) },
      holdReason:   o.hold_reason || '',
      timestamp:    o.created_at,
      splits:       batchesByOrder[o.id] || [],
    }))

    const shapedMachines = machines.map(m => ({
      id: m.id, name: m.name, capacity: m.capacity, status: m.status
    }))

    const shapedSupervisors = supervisors.map(s => ({ id: s.id, name: s.name }))

    const shapedProcessList = processList.map(p => ({
      code: p.code, name: p.name, enabled: p.is_enabled,
      order: p.display_order, defaultDays: p.default_days,
    }))

    return NextResponse.json({
      ok: true,
      db: {
        orders:         shapedOrders,
        machines:       shapedMachines,
        supervisors:    shapedSupervisors,
        processList:    shapedProcessList,
        fobRecords:    fobRecords.map(shapeFob),
        faultyRecords: faultyRecords.map(shapeFaulty),
      },
      meta: {
        orderCount:  shapedOrders.length,
        batchCount:  batches.length,
        generatedAt: new Date().toISOString(),
      },
    })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}
