// GET /api/notices — the 🔔 bell in the menu bar: a short list of things that
// need attention, worked out from the database (the bell used to read an old
// browser copy that is no longer filled, so it always said "All clear").
import { NextRequest, NextResponse } from 'next/server'
import { guard } from '@/lib/access'
import { dbSelect, dbSelectAll } from '@/lib/supabase'
import { todayIST } from '@/lib/istDate'

interface Notice { id: string; type: string; title: string; body: string; link: string; urgent: boolean }

export async function GET(req: NextRequest) {
  { const g = await guard(req, 'notices', 'GET'); if (g.deny) return g.deny }
  const [oRes, bRes, mRes, fRes, rRes] = await Promise.all([
    dbSelectAll<any>('orders', { status: 'neq.done', order: 'created_at.asc' },
      'id,order_number,status,planned_dates,delivery_date,supervisor_id,supervisors(name)'),
    dbSelectAll<any>('batches', { status: 'not.in.(done,written-off,reprocessed)', order: 'created_at.asc' }, 'id,machine_id,kg'),
    dbSelect<any>('machines', { order: 'name.asc' }, 'id,name,capacity,is_active'),
    dbSelect<any>('faulty_records', { status: 'eq.open', order: 'created_at.desc', limit: '200' }, 'id,order_number'),
    dbSelect<any>('repairing_orders', { status: 'eq.pending', order: 'created_at.desc', limit: '200' }, 'id,batch_id'),
  ])
  const err = oRes.error || bRes.error || mRes.error || fRes.error || rRes.error
  if (err) return NextResponse.json({ ok: false, error: err }, { status: 500 })

  const today = todayIST()
  const orders = oRes.data || []
  const notes: Notice[] = []
  const list = (xs: string[], n = 3) => xs.slice(0, n).join(', ') + (xs.length > n ? ` +${xs.length - n} more` : '')

  // ① overdue: dispatch / delivery date before today (IST), not done / new / on hold
  const overdue = orders.filter((o: any) => {
    if (['new', 'hold'].includes(o.status)) return false
    const d = String(o.delivery_date || o.planned_dates?.Dispatch || '').slice(0, 10)
    return /^\d{4}-\d{2}-\d{2}$/.test(d) && d < today
  })
  if (overdue.length) notes.push({ id: 'overdue', type: 'overdue', urgent: true,
    title: `${overdue.length} Overdue Order${overdue.length > 1 ? 's' : ''}`,
    body: list(overdue.map((o: any) => o.order_number)), link: '/delivery' })

  // ② machines at ≥ 80 % of capacity (unfinished batches on them)
  const load: Record<string, number> = {}
  for (const b of bRes.data || []) if (b.machine_id) load[b.machine_id] = (load[b.machine_id] || 0) + (parseFloat(b.kg) || 0)
  for (const m of mRes.data || []) {
    const cap = parseFloat(m.capacity) || 0
    if (!cap || m.is_active === false) continue
    const pct = Math.round(((load[m.id] || 0) / cap) * 100)
    if (pct >= 80) notes.push({ id: `cap-${m.id}`, type: 'capacity', urgent: pct >= 95,
      title: `${m.name} at ${pct}% capacity`, body: `${Math.round(load[m.id] || 0)} / ${cap} Kg waiting or running`,
      link: `/machines/${m.id}` })
  }

  // ③ open faulty records
  const openFaulty = fRes.data || []
  if (openFaulty.length) notes.push({ id: 'faulty', type: 'faulty', urgent: true,
    title: `${openFaulty.length} Open Faulty Record${openFaulty.length > 1 ? 's' : ''}`,
    body: list(openFaulty.map((r: any) => r.order_number || '—'), 2), link: '/faulty' })

  // ④ supervisor inbox ≥ 5 (assigned, route not confirmed yet)
  const inbox: Record<string, { name: string; n: number }> = {}
  for (const o of orders) if (o.status === 'assigned' && o.supervisor_id) {
    const k = o.supervisor_id
    inbox[k] = inbox[k] || { name: o.supervisors?.name || 'Supervisor', n: 0 }
    inbox[k].n++
  }
  for (const [id, v] of Object.entries(inbox)) if (v.n >= 5) notes.push({ id: `inbox-${id}`, type: 'inbox',
    urgent: v.n >= 10, title: `${v.name} — ${v.n} orders in inbox`, body: 'Routes still to be confirmed',
    link: `/supervisor/${encodeURIComponent(id)}` })

  // ⑤ orders on hold
  const held = orders.filter((o: any) => o.status === 'hold')
  if (held.length) notes.push({ id: 'hold', type: 'hold', urgent: false,
    title: `${held.length} Order${held.length > 1 ? 's' : ''} on Hold`, body: list(held.map((o: any) => o.order_number)), link: '/orders' })

  // ⑥ repairs waiting to be split
  const repairs = rRes.data || []
  if (repairs.length) notes.push({ id: 'repair', type: 'repair', urgent: false,
    title: `${repairs.length} Repairing Order${repairs.length > 1 ? 's' : ''} Pending`, body: 'Waiting to be split / assigned', link: '/repairing-order' })

  return NextResponse.json({ ok: true, data: notes })
}
