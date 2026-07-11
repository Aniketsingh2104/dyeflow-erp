/**
 * /api/snapshot — Denormalized factory snapshot for Report Agent queries.
 * Returns orders (with splits inline), fobRecords, faultyRecords, machines,
 * supervisors, and processList in the same shape that QUERY_LIBRARY expects.
 */
import { NextResponse } from 'next/server'
import { dbSelect } from '@/lib/supabase'

export async function GET() {
  try {
    // Fetch all tables in parallel
    const [oRes, bRes, mRes, sRes, fobRes, faultyRes, pRes] = await Promise.all([
      dbSelect('orders', { order: 'created_at.desc', limit: '2000' },
        'id,order_number,party,article,color,qty_kg,status,supervisor_id,machine_id,process_route,planned_dates,hold_reason,created_at,supervisors(name),machines(name,capacity)'),
      dbSelect('batches', { order: 'created_at.asc', limit: '10000' },
        'id,batch_id,order_id,kg,status,current_process,process_route,fms_enter_at,fms_actual_dates,is_faulty,updated_at,machines(name)'),
      dbSelect('machines', { order: 'name.asc' }, 'id,name,capacity,status,machine_type'),
      dbSelect('supervisors', { order: 'name.asc' }, 'id,name'),
      dbSelect('fob', { order: 'created_at.desc', limit: '500' }).catch(() => ({ data: [] })),
      dbSelect('faulty', { order: 'created_at.desc', limit: '500' }).catch(() => ({ data: [] })),
      dbSelect('process_list', { order: 'display_order.asc', limit: '100' },
        'id,code,name,is_enabled,display_order,default_days').catch(() => ({ data: [] })),
    ])

    const orders  = (oRes.data  || []) as any[]
    const batches = (bRes.data  || []) as any[]
    const machines    = (mRes.data || []) as any[]
    const supervisors = (sRes.data || []) as any[]
    const fobRecords    = (fobRes.data    || []) as any[]
    const faultyRecords = (faultyRes.data || []) as any[]
    const processList   = (pRes.data || []) as any[]

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
      plannedDates: o.planned_dates || {},
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
        fobRecords,
        faultyRecords,
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
