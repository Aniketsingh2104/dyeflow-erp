/**
 * lib/rpc.ts — call the all-or-nothing database functions (server only).
 *
 * The functions (df_process_done, df_reprocess …, see dyeflow-section5.sql)
 * lock the batch, check it is still where the page thinks it is, and either
 * do every step or none. They answer:
 *   409  the batch / record changed since the page loaded → "refresh"
 *   404  not found       400  bad input
 */
import { NextResponse } from 'next/server'
import { sb, currentUsername } from '@/lib/supabase'

export interface RpcResult<T> { data: T | null; error: string | null; status: number }

export async function rpc<T = any>(fn: string, args: Record<string, any>): Promise<RpcResult<T>> {
  const withUser = 'p_user' in args ? args : { ...args, p_user: (await currentUsername()) || 'system' }
  const r = await sb<T>(`/rpc/${fn}`, { method: 'POST', body: JSON.stringify(withUser) })
  if (r.error) {
    const status = [400, 403, 404, 409].includes(r.status) ? r.status : 500
    return { data: null, error: r.error, status }
  }
  return { data: r.data as T, error: null, status: 200 }
}

/** The JSON error response for a failed rpc() */
export function rpcFail(r: RpcResult<any>) {
  return NextResponse.json({ ok: false, error: r.error, stale: r.status === 409 || undefined }, { status: r.status })
}
