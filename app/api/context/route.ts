import { NextRequest, NextResponse } from 'next/server'
import { dbSelect } from '@/lib/supabase'

// Builds a compact AI context string from live Supabase data.
// Equivalent to the old buildDbContext() but server-side, no localStorage.

function fmtDate(d: any) {
  if (!d) return '-'
  try { return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) }
  catch { return String(d) }
}

function today() {
  return new Date().toLocaleDateString('en-GB', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })
}

function daysUntil(d: string): number {
  if (!d) return 999
  const dt = new Date(d)
  return isNaN(dt.getTime()) ? 999 : Math.floor((dt.getTime() - Date.now()) / 86400000)
}

export async function GET(req: NextRequest) {
  try {
    const [ordersRes, batchesRes, machinesRes, supervisorsRes, faultyRes, fobRes, processesRes] =
      await Promise.all([
        dbSelect('orders', { order: 'created_at.desc', limit: '200' },
          'id,order_number,party,article,color,qty_kg,qty_mtr,status,process_route,created_at,supervisors(name),machines(id,name)'),
        dbSelect('batches', { order: 'created_at.desc', limit: '500' },
          'id,batch_id,order_id,kg,status,current_process,is_faulty,created_at,machines(name)'),
        dbSelect('machines', { order: 'name.asc' },
          'id,name,capacity,status'),
        dbSelect('supervisors', { order: 'name.asc' },
          'id,name'),
        dbSelect('faulty_records', { status: 'eq.open', order: 'created_at.desc', limit: '50' },
          'id,batch_id,order_number,party,faulty_type,faulty_kg,process_code,created_at'),
        dbSelect('fob_records', { status: 'eq.open', order: 'created_at.desc', limit: '50' },
          'id,batch_id,order_number,party,fob_type,fob_kg,process_code,created_at'),
        dbSelect('processes', { order: 'name.asc' },
          'id,code,name'),
      ])

    const orders     = ordersRes.data     || []
    const batches    = batchesRes.data    || []
    const machines   = machinesRes.data   || []
    const supervisors = supervisorsRes.data || []
    const faultyOpen = faultyRes.data     || []
    const fobOpen    = fobRes.data        || []
    const processes  = processesRes.data  || []

    // Build batch map by order_id
    const batchMap: Record<string, any[]> = {}
    for (const b of batches) {
      if (!batchMap[b.order_id]) batchMap[b.order_id] = []
      batchMap[b.order_id].push(b)
    }

    // Status counts
    const statusGroups: Record<string, number> = {}
    orders.forEach(o => { statusGroups[o.status || 'new'] = (statusGroups[o.status || 'new'] || 0) + 1 })

    // Overdue
    const overdue = orders.filter(o => {
      if (['done','new'].includes(o.status)) return false
      const route: string[] = o.process_route || []
      // Use last process in route as proxy for dispatch
      return false // no planned dates in new schema — skip for now
    })

    // Active orders
    const activeOrders = orders.filter(o => o.status !== 'done').slice(0, 50)

    // Machine loads
    const machineLoad: Record<string, { kg: number; count: number; orders: string[] }> = {}
    for (const b of batches) {
      if (b.status === 'done') continue
      const mname = b.machines?.name || 'unknown'
      if (!machineLoad[mname]) machineLoad[mname] = { kg: 0, count: 0, orders: [] }
      machineLoad[mname].kg += parseFloat(b.kg) || 0
      machineLoad[mname].count++
    }

    const machineLines = machines.map(m => {
      const load = machineLoad[m.name] || { kg: 0, count: 0 }
      const pct  = m.capacity ? Math.min(100, Math.round((load.kg / m.capacity) * 100)) : 0
      return `  ${m.name}: cap:${m.capacity}kg loaded:${Math.round(load.kg)}kg(${pct}%) batches:${load.count} status:${m.status || 'idle'}`
    })

    // Supervisor loads
    const supLoad: Record<string, { inbox: number; active: number; done: number }> = {}
    for (const o of orders) {
      const sup = o.supervisors?.name || 'Unassigned'
      if (!supLoad[sup]) supLoad[sup] = { inbox: 0, active: 0, done: 0 }
      if (o.status === 'new' || o.status === 'pending') supLoad[sup].inbox++
      else if (['in-process','splitting','assigned'].includes(o.status)) supLoad[sup].active++
      else if (o.status === 'done') supLoad[sup].done++
    }

    const supLines = supervisors.map(s => {
      const l = supLoad[s.name] || { inbox: 0, active: 0, done: 0 }
      return `  ${s.name}: inbox:${l.inbox} active:${l.active} done:${l.done}`
    })

    // Order lines
    const orderLines = activeOrders.map(o => {
      const route = (o.process_route || []).join('→') || '?'
      const oBatches = batchMap[o.id] || []
      const batchStr = oBatches.length > 0
        ? oBatches.map(b => `${b.batch_id}(${b.kg}kg${b.current_process ? ',' + b.current_process : ''})`).join(' ')
        : 'not split'
      const faulty = oBatches.filter(b => b.is_faulty).length
      return `  ${o.order_number}:${o.party}|${o.article}|${o.color}|${o.qty_kg}kg|${o.status}|sup:${o.supervisors?.name || '-'}|machine:${o.machines?.name || '-'}|${route}|[${batchStr}]${faulty > 0 ? '|FAULTY:' + faulty : ''}`
    })

    const processLine = processes.map(p => `${p.code}(${p.name})`).join(', ')

    const full = `TODAY: ${today()}
=== DYEFLOW FACTORY ERP ===
STATS: orders:${orders.length}(done:${statusGroups['done'] || 0} active:${orders.filter(o => o.status !== 'done').length}) batches:${batches.length} faulty:${faultyOpen.length}open fob:${fobOpen.length}open
STATUS: ${Object.entries(statusGroups).map(([s, n]) => `${s}:${n}`).join(' ')}
PROCESSES: ${processLine || 'none'}

MACHINES(${machines.length}):
${machineLines.join('\n') || '  none'}

SUPERVISORS(${supervisors.length}):
${supLines.join('\n') || '  none'}

OPEN FAULTY(${faultyOpen.length}):
${faultyOpen.slice(0, 10).map(r => `  ${r.batch_id}|${r.order_number}|${r.party}|${r.faulty_type || '?'}`).join('\n') || '  none'}

OPEN FOB(${fobOpen.length}):
${fobOpen.slice(0, 10).map(r => `  ${r.batch_id}|${r.order_number}|${r.party}|${r.fob_type || '?'}`).join('\n') || '  none'}

ACTIVE ORDERS(${orders.filter(o => o.status !== 'done').length} total, showing ${activeOrders.length} most recent):
${orderLines.join('\n') || '  none'}`.trim()

    const summary = `${orders.length} orders · ${batches.length} batches · ${machines.length} machines · ${faultyOpen.length} open faulty · ${fobOpen.length} open FOB`

    return NextResponse.json({ ok: true, full, summary, orderCount: orders.length, batchCount: batches.length })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 })
  }
}
