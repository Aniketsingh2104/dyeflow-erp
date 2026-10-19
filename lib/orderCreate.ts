/**
 * lib/orderCreate.ts — creating an order, and which order columns the app may
 * write (server only). Used by /api/orders and by approving a party sheet row.
 */
import { dbSelect, dbInsert, sb, auditLog } from '@/lib/supabase'

/** Columns a page may set on an order. Anything else the browser sends
 *  (id, order_number, created_at, created_by …) is dropped. */
export const ORDER_FIELDS = [
  'challan_no', 'party', 'article', 'color', 'shade_group', 'blend', 'qty_kg', 'qty_mtr', 'no_of_taka',
  'status', 'supervisor_id', 'machine_id', 'process_route', 'process_machines', 'planned_dates',
  'hold_reason', 'hold_approval', 'remarks', 'priority', 'dyeing_fob', 'rolling_fob',
  'gsm', 'width', 'lab_no', 'lot_no', 'sub_party', 'sales_person', 'type_of_finish', 'type_of_packing',
  'delivery_date', 'supervisor_confirmed', 'supervisor_confirmed_at', 'imported_at',
  'lab_recheck', 'lab_recheck_at', 'lab_receive', 'lab_receive_at',
  'greige_check', 'greige_check_at', 'greige_recheck_fail_reason',
] as const

export const ORDER_STATUSES = ['new', 'assigned', 'splitting', 'in-process', 'done', 'hold']

export function cleanOrderFields(payload: Record<string, any>): Record<string, any> {
  const out: Record<string, any> = {}
  for (const k of ORDER_FIELDS) if (payload[k] !== undefined) out[k] = payload[k]
  return out
}

// article_supervisor_map.supervisor stores the NAME; resolve it to the UUID
export async function lookupSupervisor(article: string): Promise<string | null> {
  if (!article) return null
  try {
    const { data: mapRows } = await dbSelect('article_supervisor_map', { article: `eq.${article}`, limit: '1' }, 'supervisor')
    const supervisorName = mapRows?.[0]?.supervisor
    if (!supervisorName) return null
    const { data: supRows } = await dbSelect('supervisors', { name: `eq.${supervisorName}`, limit: '1' }, 'id')
    return supRows?.[0]?.id || null
  } catch {
    return null
  }
}

/** Next order number from the database counter (DYE26-0001 …). */
export async function nextOrderNumber(): Promise<{ number: string | null; error: string | null }> {
  const { data, error } = await sb<string>('/rpc/next_order_number', { method: 'POST', body: '{}' })
  if (error || !data) return { number: null, error: 'Could not get the next order number: ' + (error || 'empty') }
  return { number: data, error: null }
}

/** Create one order. The order number always comes from the database counter
 *  (approve_row takes one first and passes it in as opts.orderNumber). */
export async function createOrder(input: Record<string, any>, label?: string,
  opts: { orderNumber?: string } = {}): Promise<{ data: any; error: string | null }> {
  const payload = cleanOrderFields(input)
  if (!String(payload.party || '').trim()) return { data: null, error: 'Party is required' }
  if (payload.status && !ORDER_STATUSES.includes(payload.status)) return { data: null, error: `Unknown status "${payload.status}"` }

  let supervisorId: string | null = payload.supervisor_id || null
  if (!supervisorId && payload.article) supervisorId = await lookupSupervisor(payload.article)

  let nextNo = opts.orderNumber || null
  if (!nextNo) {
    const r = await nextOrderNumber()
    if (r.error || !r.number) return { data: null, error: r.error || 'Could not get the next order number' }
    nextNo = r.number
  }

  const insertPayload = {
    ...payload,
    order_number: nextNo,
    supervisor_id: supervisorId || null,
    // Hold always wins; otherwise 'assigned' if a supervisor was found, else 'new'
    status: payload.status === 'hold' || payload.hold_approval === 'Hold' ? 'hold'
          : supervisorId ? 'assigned' : (payload.status || 'new'),
  }
  const { data, error } = await dbInsert('orders', insertPayload)
  if (error) return { data: null, error }

  if (Array.isArray(payload.process_route) && payload.process_route.length && data?.id) {
    await sb('/planned_dates?on_conflict=order_id,process_code', {
      method: 'POST',
      body: JSON.stringify(payload.process_route.map((code: string) => ({ order_id: data.id, process_code: code }))),
      headers: { 'Prefer': 'resolution=merge-duplicates,return=minimal' },
    })
  }
  await auditLog({
    username: label, action: 'create', entity_type: 'order', entity_id: data?.order_number,
    new_value: `${payload.party} · ${payload.article} · ${payload.qty_kg}kg · supervisor: ${supervisorId || 'none'}`,
  })
  return { data, error: null }
}
