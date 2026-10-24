/**
 * lib/orderStatus.ts — keeps orders.status in step with its batches (server only).
 *
 * Called after every batch change (split, send, done, faulty, FOB, repair…):
 *   • 'hold' is never changed automatically
 *   • any batch started (in-process / done / faulty / repairing / sent)  → 'in-process'
 *   • every batch done or written off (repairs included) AND the full
 *     order qty split                                                    → 'done'
 *       e.g. 1,000 kg order, 600 kg split and all done → stays 'in-process'
 *            until the other 400 kg is split and finished
 *   • batches exist but none started yet                                 → 'splitting'
 *   • no batches at all                                                  → left as it is
 * A 'done' order that gets a batch rolled back goes back to 'in-process'.
 *
 * The work is done by the database function df_refresh_order_status
 * (dyeflow-section7.sql), which locks the order while it reads the batches —
 * two changes at the same moment can no longer leave a wrong status. If that
 * function isn't there yet, the same rule runs here as before.
 */
import { dbSelect, dbUpdate, sb } from '@/lib/supabase'

const QTY_TOLERANCE_KG = 0.5

export async function refreshOrderStatus(orderId: string | null | undefined): Promise<string | null> {
  if (!orderId) return null
  const r = await sb<string>('/rpc/df_refresh_order_status', { method: 'POST', body: JSON.stringify({ p_order: orderId }) })
  if (!r.error) return (r.data as any) ?? null
  return refreshInApp(orderId)
}

async function refreshInApp(orderId: string): Promise<string | null> {
  try {
    const [{ data: oRows }, { data: batches }] = await Promise.all([
      dbSelect('orders', { id: `eq.${orderId}`, limit: '1' }, 'id,status,qty_kg'),
      dbSelect('batches', { order_id: `eq.${orderId}` }, 'id,status,kg,is_done,current_process,sent_at'),
    ])
    const order = oRows?.[0]
    if (!order || order.status === 'hold') return order?.status ?? null
    if (!batches?.length) return order.status

    const started = batches.some((b: any) =>
      b.status === 'in-process' || b.status === 'done' || b.status === 'faulty' ||
      b.status === 'repairing' || b.status === 'written-off' || b.status === 'reprocessed' || b.is_done || !!b.current_process || !!b.sent_at)
    const allDone = batches.every((b: any) => b.status === 'done' || b.status === 'written-off' || b.status === 'reprocessed' || b.is_done === true)
    // a reprocessed original's kg is counted on its -R batch
    const splitKg = batches.reduce((s: number, b: any) => s + (b.status === 'reprocessed' ? 0 : (parseFloat(b.kg) || 0)), 0)
    const fullySplit = splitKg >= (parseFloat(order.qty_kg) || 0) - QTY_TOLERANCE_KG

    const next = allDone && fullySplit ? 'done' : started ? 'in-process' : 'splitting'
    if (next !== order.status) {
      await dbUpdate('orders', { id: orderId }, { status: next })
    }
    return next
  } catch {
    return null   // never let a status refresh break the action that triggered it
  }
}

/** Same, starting from a batch uuid. */
export async function refreshOrderStatusForBatch(batchUuid: string | null | undefined): Promise<string | null> {
  if (!batchUuid) return null
  const { data } = await dbSelect('batches', { id: `eq.${batchUuid}`, limit: '1' }, 'order_id')
  return refreshOrderStatus(data?.[0]?.order_id)
}
